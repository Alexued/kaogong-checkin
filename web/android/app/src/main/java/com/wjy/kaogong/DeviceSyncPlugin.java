package com.wjy.kaogong;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "DeviceSync")
public class DeviceSyncPlugin extends Plugin {
  private static final String SERVICE_TYPE = "_kgc-sync._tcp.";
  private static final int PROTOCOL_VERSION = 1;
  private static final int MAX_FRAME_BYTES = 10 * 1024 * 1024;
  private static final int MAX_RECOVERY_BYTES = 12 * 1024 * 1024;
  private static final int SOCKET_TIMEOUT_MS = 120_000;
  private static final int CONNECT_TIMEOUT_MS = 8_000;
  private static final long PAIRING_LIFETIME_MS = 10 * 60 * 1000L;
  private static final int MAX_PAIRING_FAILURES = 5;
  private static final long FAILURE_WINDOW_MS = 60_000L;
  private static final long BLOCK_TIME_MS = 60_000L;

  private final ExecutorService io = Executors.newCachedThreadPool();
  private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
  private final SecureRandom random = new SecureRandom();
  private final Map<String, PendingIncoming> incoming = new ConcurrentHashMap<>();
  private final Map<String, PendingPull> outgoingPulls = new ConcurrentHashMap<>();
  private final Map<String, AttemptWindow> pairingAttempts = new ConcurrentHashMap<>();
  private final Map<String, String> serviceDeviceIds = new ConcurrentHashMap<>();
  private final Queue<ResolveCandidate> resolveQueue = new ConcurrentLinkedQueue<>();
  private final AtomicBoolean resolving = new AtomicBoolean(false);

  private NsdManager nsdManager;
  private WifiManager.MulticastLock multicastLock;
  private ServerSocket serverSocket;
  private NsdManager.RegistrationListener registrationListener;
  private NsdManager.DiscoveryListener discoveryListener;
  private ScheduledFuture<?> pairingRotation;
  private volatile boolean hosting;
  private volatile boolean discovering;
  private volatile int discoveryGeneration;
  private volatile String localDeviceId = "";
  private volatile String appVersion = "";
  private volatile String localAddress = "";
  private volatile int localPort;
  private volatile String pairingCode = "";
  private volatile String sessionId = "";
  private volatile long pairingExpiresAt;

  @Override
  public void load() {
    nsdManager = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
  }

  @PluginMethod
  public void startHosting(PluginCall call) {
    String deviceId = normalized(call.getString("deviceId", ""));
    if (!validIdentifier(deviceId)) {
      call.reject("INVALID_DEVICE_ID", "INVALID_DEVICE_ID");
      return;
    }
    stopHostingInternal();
    localDeviceId = deviceId;
    appVersion = normalized(call.getString("appVersion", ""));
    try {
      serverSocket = new ServerSocket();
      serverSocket.setReuseAddress(true);
      serverSocket.bind(new InetSocketAddress(0));
      localPort = serverSocket.getLocalPort();
      localAddress = findLocalIpv4();
      if (localAddress.isEmpty()) throw new IOException("LOCAL_ADDRESS_UNAVAILABLE");
      rotatePairingCode(false);
      hosting = true;
      acquireMulticastLock();
      registerService();
      io.execute(this::acceptLoop);
      pairingRotation = scheduler.scheduleAtFixedRate(
        () -> rotatePairingCode(true),
        PAIRING_LIFETIME_MS,
        PAIRING_LIFETIME_MS,
        TimeUnit.MILLISECONDS
      );
      call.resolve(hostingInfo());
    } catch (Exception error) {
      stopHostingInternal();
      call.reject(errorCode(error, "HOST_START_FAILED"), "HOST_START_FAILED", error);
    }
  }

  @PluginMethod
  public void stopHosting(PluginCall call) {
    stopHostingInternal();
    call.resolve();
  }

  @PluginMethod
  public void startDiscovery(PluginCall call) {
    String deviceId = normalized(call.getString("deviceId", ""));
    if (!validIdentifier(deviceId)) {
      call.reject("INVALID_DEVICE_ID", "INVALID_DEVICE_ID");
      return;
    }
    stopDiscoveryInternal();
    localDeviceId = deviceId;
    discovering = true;
    int generation = ++discoveryGeneration;
    acquireMulticastLock();
    discoveryListener = new NsdManager.DiscoveryListener() {
      @Override public void onDiscoveryStarted(String serviceType) {}
      @Override public void onStartDiscoveryFailed(String serviceType, int errorCode) {
        if (generation != discoveryGeneration) return;
        discovering = false;
        notifyError("DISCOVERY_START_FAILED", errorCode);
      }
      @Override public void onStopDiscoveryFailed(String serviceType, int errorCode) {
        if (generation == discoveryGeneration) notifyError("DISCOVERY_STOP_FAILED", errorCode);
      }
      @Override public void onDiscoveryStopped(String serviceType) {}
      @Override public void onServiceFound(NsdServiceInfo serviceInfo) {
        if (!discovering || generation != discoveryGeneration) return;
        resolveQueue.offer(new ResolveCandidate(serviceInfo, generation));
        resolveNext();
      }
      @Override public void onServiceLost(NsdServiceInfo serviceInfo) {
        if (generation != discoveryGeneration) return;
        String id = serviceDeviceIds.remove(serviceInfo.getServiceName());
        if (id != null) {
          JSObject event = new JSObject();
          event.put("deviceId", id);
          notifyListeners("peerLost", event);
        }
      }
    };
    try {
      nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
      call.resolve();
    } catch (Exception error) {
      stopDiscoveryInternal();
      call.reject(errorCode(error, "DISCOVERY_START_FAILED"), "DISCOVERY_START_FAILED", error);
    }
  }

  @PluginMethod
  public void stopDiscovery(PluginCall call) {
    stopDiscoveryInternal();
    call.resolve();
  }

  @PluginMethod
  public void push(PluginCall call) {
    JSONObject peer = call.getObject("peer");
    JSONObject transfer = call.getObject("transfer");
    String code = normalized(call.getString("pairingCode", ""));
    if (peer == null || transfer == null || !code.matches("\\d{6}")) {
      call.reject("INVALID_PUSH_REQUEST", "INVALID_PUSH_REQUEST");
      return;
    }
    io.execute(() -> {
      Socket socket = null;
      try {
        validateTransfer(transfer);
        socket = connect(peer);
        DataInputStream input = input(socket);
        DataOutputStream output = output(socket);
        String requestId = UUID.randomUUID().toString();
        JSONObject offer = baseOffer("push-offer", requestId, peer, code);
        offer.put("summary", transfer.getJSONObject("summary"));
        offer.put("snapshotSha256", transfer.getString("snapshotSha256"));
        offer.put("snapshotUtf8Bytes", transfer.getInt("snapshotUtf8Bytes"));
        writeFrame(output, offer);
        JSONObject response = readFrame(input);
        requireKind(response, requestId, "ready");
        JSONObject frame = new JSONObject();
        frame.put("kind", "snapshot");
        frame.put("requestId", requestId);
        frame.put("transfer", transfer);
        writeFrame(output, frame);
        JSONObject committed = readFrame(input);
        requireKind(committed, requestId, "committed");
        JSObject result = new JSObject();
        result.put("requestId", requestId);
        result.put("status", "committed");
        call.resolve(result);
      } catch (Exception error) {
        rejectNetwork(call, error, "PUSH_FAILED");
      } finally {
        closeQuietly(socket);
      }
    });
  }

  @PluginMethod
  public void pull(PluginCall call) {
    JSONObject peer = call.getObject("peer");
    String code = normalized(call.getString("pairingCode", ""));
    if (peer == null || !code.matches("\\d{6}")) {
      call.reject("INVALID_PULL_REQUEST", "INVALID_PULL_REQUEST");
      return;
    }
    io.execute(() -> {
      Socket socket = null;
      try {
        socket = connect(peer);
        DataInputStream input = input(socket);
        DataOutputStream output = output(socket);
        String requestId = UUID.randomUUID().toString();
        writeFrame(output, baseOffer("pull-offer", requestId, peer, code));
        JSONObject response = readFrame(input);
        requireKind(response, requestId, "snapshot");
        JSONObject transfer = response.getJSONObject("transfer");
        validateTransfer(transfer);
        PendingPull pending = new PendingPull(requestId, socket, input, output);
        socket = null;
        outgoingPulls.put(requestId, pending);
        scheduler.schedule(() -> expirePull(requestId), SOCKET_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        JSObject result = new JSObject();
        result.put("requestId", requestId);
        result.put("transfer", transfer);
        call.resolve(result);
      } catch (Exception error) {
        rejectNetwork(call, error, "PULL_FAILED");
      } finally {
        closeQuietly(socket);
      }
    });
  }

  @PluginMethod
  public void completePull(PluginCall call) {
    String requestId = normalized(call.getString("requestId", ""));
    PendingPull pending = outgoingPulls.remove(requestId);
    if (pending == null) {
      call.reject("REQUEST_NOT_FOUND", "REQUEST_NOT_FOUND");
      return;
    }
    boolean committed = Boolean.TRUE.equals(call.getBoolean("committed", false));
    try {
      writeFrame(pending.output, resultFrame(requestId, committed, call.getString("error", "")));
      call.resolve();
    } catch (Exception error) {
      call.reject(errorCode(error, "COMPLETE_PULL_FAILED"), "COMPLETE_PULL_FAILED", error);
    } finally {
      pending.close();
    }
  }

  @PluginMethod
  public void approveIncoming(PluginCall call) {
    String requestId = normalized(call.getString("requestId", ""));
    PendingIncoming pending = incoming.get(requestId);
    if (pending == null || !pending.state.compareAndSet(PendingState.WAITING_APPROVAL, PendingState.APPROVED)) {
      call.reject("REQUEST_NOT_FOUND", "REQUEST_NOT_FOUND");
      return;
    }
    boolean accepted = Boolean.TRUE.equals(call.getBoolean("accepted", false));
    if (!accepted) {
      try { writeFrame(pending.output, resultFrame(requestId, false, "REJECTED")); } catch (Exception ignored) {}
      removeIncoming(requestId);
      call.resolve();
      return;
    }

    if ("pull-offer".equals(pending.kind)) {
      JSONObject transfer = call.getObject("transfer");
      try {
        if (transfer == null) throw new ProtocolException("TRANSFER_REQUIRED");
        validateTransfer(transfer);
        JSONObject frame = new JSONObject();
        frame.put("kind", "snapshot");
        frame.put("requestId", requestId);
        frame.put("transfer", transfer);
        writeFrame(pending.output, frame);
        pending.state.set(PendingState.WAITING_REMOTE_COMMIT);
        call.resolve();
        io.execute(() -> waitForRemoteCommit(pending));
      } catch (Exception error) {
        removeIncoming(requestId);
        call.reject(errorCode(error, "SEND_SNAPSHOT_FAILED"), "SEND_SNAPSHOT_FAILED", error);
      }
      return;
    }

    try {
      JSONObject ready = new JSONObject();
      ready.put("kind", "ready");
      ready.put("requestId", requestId);
      writeFrame(pending.output, ready);
      pending.state.set(PendingState.WAITING_SNAPSHOT);
      call.resolve();
      io.execute(() -> waitForIncomingSnapshot(pending));
    } catch (Exception error) {
      removeIncoming(requestId);
      call.reject(errorCode(error, "APPROVAL_FAILED"), "APPROVAL_FAILED", error);
    }
  }

  @PluginMethod
  public void completeIncoming(PluginCall call) {
    String requestId = normalized(call.getString("requestId", ""));
    PendingIncoming pending = incoming.remove(requestId);
    if (pending == null || pending.state.get() != PendingState.WAITING_LOCAL_COMMIT) {
      call.reject("REQUEST_NOT_FOUND", "REQUEST_NOT_FOUND");
      return;
    }
    boolean committed = Boolean.TRUE.equals(call.getBoolean("committed", false));
    try {
      writeFrame(pending.output, resultFrame(requestId, committed, call.getString("error", "")));
      call.resolve();
    } catch (Exception error) {
      call.reject(errorCode(error, "COMPLETE_INCOMING_FAILED"), "COMPLETE_INCOMING_FAILED", error);
    } finally {
      pending.close();
    }
  }

  @PluginMethod
  public void saveRecoveryPoint(PluginCall call) {
    String bundleJson = call.getString("bundleJson", "");
    String sourceName = normalized(call.getString("sourceName", "设备传输前"));
    String sourceDeviceId = normalized(call.getString("sourceDeviceId", "unknown-device"));
    JSONObject summary = call.getObject("summary");
    byte[] bytes = bundleJson.getBytes(StandardCharsets.UTF_8);
    if (bytes.length == 0 || bytes.length > MAX_RECOVERY_BYTES || summary == null) {
      call.reject("INVALID_RECOVERY_POINT", "INVALID_RECOVERY_POINT");
      return;
    }
    io.execute(() -> {
      try {
        File directory = recoveryDirectory();
        String id = Instant.now().toEpochMilli() + "-" + UUID.randomUUID().toString().substring(0, 8);
        String createdAt = Instant.now().toString();
        JSONObject wrapper = new JSONObject();
        wrapper.put("formatVersion", 1);
        wrapper.put("id", id);
        wrapper.put("createdAt", createdAt);
        wrapper.put("sourceName", sourceName.isEmpty() ? "设备传输前" : sourceName);
        wrapper.put("sourceDeviceId", sourceDeviceId);
        wrapper.put("utf8Bytes", bytes.length);
        wrapper.put("sha256", sha256(bundleJson));
        wrapper.put("summary", new JSONObject(summary.toString()));
        wrapper.put("bundleJson", bundleJson);
        atomicWrite(new File(directory, id + ".json"), wrapper.toString());
        pruneRecoveryPoints(directory);
        call.resolve(recoveryMetadata(wrapper));
      } catch (Exception error) {
        call.reject(errorCode(error, "RECOVERY_WRITE_FAILED"), "RECOVERY_WRITE_FAILED", error);
      }
    });
  }

  @PluginMethod
  public void listRecoveryPoints(PluginCall call) {
    io.execute(() -> {
      try {
        JSArray points = new JSArray();
        for (JSONObject wrapper : readRecoveryWrappers()) points.put(recoveryMetadata(wrapper));
        JSObject result = new JSObject();
        result.put("points", points);
        call.resolve(result);
      } catch (Exception error) {
        call.reject(errorCode(error, "RECOVERY_LIST_FAILED"), "RECOVERY_LIST_FAILED", error);
      }
    });
  }

  @PluginMethod
  public void readRecoveryPoint(PluginCall call) {
    String id = normalized(call.getString("id", ""));
    if (!id.matches("[0-9]+-[a-f0-9]{8}")) {
      call.reject("INVALID_RECOVERY_ID", "INVALID_RECOVERY_ID");
      return;
    }
    io.execute(() -> {
      try {
        JSONObject wrapper = readJson(new File(recoveryDirectory(), id + ".json"));
        validateRecoveryWrapper(wrapper);
        JSObject result = new JSObject();
        result.put("point", recoveryMetadata(wrapper));
        result.put("bundleJson", wrapper.getString("bundleJson"));
        call.resolve(result);
      } catch (Exception error) {
        call.reject(errorCode(error, "RECOVERY_READ_FAILED"), "RECOVERY_READ_FAILED", error);
      }
    });
  }

  private void acceptLoop() {
    while (hosting && serverSocket != null && !serverSocket.isClosed()) {
      try {
        Socket socket = serverSocket.accept();
        socket.setSoTimeout(SOCKET_TIMEOUT_MS);
        socket.setTcpNoDelay(true);
        io.execute(() -> handleIncomingSocket(socket));
      } catch (IOException error) {
        if (hosting) notifyError("ACCEPT_FAILED", 0);
        break;
      }
    }
  }

  private void handleIncomingSocket(Socket socket) {
    boolean retained = false;
    try {
      DataInputStream input = input(socket);
      DataOutputStream output = output(socket);
      JSONObject offer = readFrame(input);
      String kind = offer.optString("kind", "");
      String requestId = offer.optString("requestId", "");
      if (!("push-offer".equals(kind) || "pull-offer".equals(kind)) || !validIdentifier(requestId)) {
        throw new ProtocolException("INVALID_OFFER");
      }
      if (offer.optInt("protocolVersion", 0) != PROTOCOL_VERSION) throw new ProtocolException("PROTOCOL_INCOMPATIBLE");
      String target = offer.optString("targetDeviceId", "");
      if (!target.isEmpty() && !localDeviceId.equals(target)) throw new ProtocolException("TARGET_MISMATCH");
      String remoteAddress = socket.getInetAddress().getHostAddress();
      if (!pairingAllowed(remoteAddress, offer.optString("pairingCode", ""))) {
        writeFrame(output, errorFrame(requestId, "PAIRING_INVALID"));
        return;
      }
      JSONObject source = validatedSourceDevice(offer.getJSONObject("sourceDevice"), remoteAddress);
      if (localDeviceId.equals(source.optString("deviceId"))) throw new ProtocolException("SELF_CONNECTION");
      JSONObject summary = offer.optJSONObject("summary");
      PendingIncoming pending = new PendingIncoming(requestId, kind, socket, input, output, source);
      if (incoming.putIfAbsent(requestId, pending) != null) throw new ProtocolException("DUPLICATE_REQUEST");
      retained = true;
      scheduler.schedule(() -> expireIncoming(requestId), SOCKET_TIMEOUT_MS, TimeUnit.MILLISECONDS);
      JSObject event = new JSObject();
      event.put("requestId", requestId);
      event.put("kind", kind);
      event.put("sourceDevice", source);
      if (summary != null) event.put("summary", summary);
      notifyListeners("incomingRequest", event);
    } catch (Exception error) {
      try {
        DataOutputStream output = output(socket);
        writeFrame(output, errorFrame("", errorCode(error, "INVALID_REQUEST")));
      } catch (Exception ignored) {}
    } finally {
      if (!retained) closeQuietly(socket);
    }
  }

  private void waitForIncomingSnapshot(PendingIncoming pending) {
    try {
      JSONObject frame = readFrame(pending.input);
      requireKind(frame, pending.requestId, "snapshot");
      JSONObject transfer = frame.getJSONObject("transfer");
      validateTransfer(transfer);
      pending.state.set(PendingState.WAITING_LOCAL_COMMIT);
      JSObject event = new JSObject();
      event.put("requestId", pending.requestId);
      event.put("sourceDevice", pending.sourceDevice);
      event.put("transfer", transfer);
      notifyListeners("incomingSnapshot", event);
    } catch (Exception error) {
      try { writeFrame(pending.output, errorFrame(pending.requestId, errorCode(error, "SNAPSHOT_RECEIVE_FAILED"))); } catch (Exception ignored) {}
      removeIncoming(pending.requestId);
    }
  }

  private void waitForRemoteCommit(PendingIncoming pending) {
    try {
      JSONObject response = readFrame(pending.input);
      String kind = response.optString("kind", "");
      if (!("committed".equals(kind) || "failed".equals(kind))) throw new ProtocolException("INVALID_COMMIT_RESPONSE");
    } catch (Exception ignored) {
      // Sender-side disclosure is complete even if the receiver cannot report its local commit.
    } finally {
      removeIncoming(pending.requestId);
    }
  }

  private Socket connect(JSONObject peer) throws Exception {
    String host = normalized(peer.optString("host", ""));
    int port = peer.optInt("port", 0);
    if (host.isEmpty() || port < 1 || port > 65535) throw new ProtocolException("INVALID_PEER_ENDPOINT");
    Socket socket = new Socket();
    socket.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
    socket.setSoTimeout(SOCKET_TIMEOUT_MS);
    socket.setTcpNoDelay(true);
    return socket;
  }

  private JSONObject baseOffer(String kind, String requestId, JSONObject peer, String code) throws Exception {
    JSONObject offer = new JSONObject();
    offer.put("protocolVersion", PROTOCOL_VERSION);
    offer.put("requestId", requestId);
    offer.put("kind", kind);
    offer.put("sourceDevice", localSourceDevice());
    String targetDeviceId = peer.optString("deviceId", "");
    offer.put("targetDeviceId", targetDeviceId.startsWith("manual-") ? "" : targetDeviceId);
    offer.put("createdAt", Instant.now().toString());
    offer.put("pairingCode", code);
    return offer;
  }

  private JSONObject localSourceDevice() throws Exception {
    JSONObject source = new JSONObject();
    source.put("deviceId", localDeviceId);
    source.put("name", deviceName());
    source.put("host", localAddress.isEmpty() ? findLocalIpv4() : localAddress);
    source.put("port", localPort);
    source.put("platform", "Android " + Build.VERSION.RELEASE);
    source.put("appVersion", appVersion);
    source.put("online", true);
    source.put("lastSeenAt", Instant.now().toString());
    return source;
  }

  private JSONObject validatedSourceDevice(JSONObject source, String remoteAddress) throws ProtocolException, JSONException {
    String id = normalized(source.optString("deviceId", ""));
    if (!validIdentifier(id)) throw new ProtocolException("INVALID_SOURCE_DEVICE");
    JSONObject normalized = new JSONObject();
    normalized.put("deviceId", id);
    normalized.put("name", safeName(source.optString("name", "Android 设备")));
    normalized.put("host", remoteAddress);
    normalized.put("port", source.optInt("port", 0));
    normalized.put("platform", safeName(source.optString("platform", "Android")));
    normalized.put("appVersion", safeName(source.optString("appVersion", "")));
    normalized.put("online", true);
    normalized.put("lastSeenAt", Instant.now().toString());
    return normalized;
  }

  private void registerService() {
    NsdServiceInfo info = new NsdServiceInfo();
    info.setServiceName("格记-" + localDeviceId.substring(0, Math.min(6, localDeviceId.length())));
    info.setServiceType(SERVICE_TYPE);
    info.setPort(localPort);
    info.setAttribute("v", String.valueOf(PROTOCOL_VERSION));
    info.setAttribute("id", localDeviceId);
    info.setAttribute("name", deviceName());
    info.setAttribute("app", appVersion);
    info.setAttribute("platform", "Android " + Build.VERSION.RELEASE);
    registrationListener = new NsdManager.RegistrationListener() {
      @Override public void onServiceRegistered(NsdServiceInfo serviceInfo) {}
      @Override public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) { notifyError("NSD_REGISTER_FAILED", errorCode); }
      @Override public void onServiceUnregistered(NsdServiceInfo serviceInfo) {}
      @Override public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) { notifyError("NSD_UNREGISTER_FAILED", errorCode); }
    };
    nsdManager.registerService(info, NsdManager.PROTOCOL_DNS_SD, registrationListener);
  }

  private void resolveNext() {
    if (!discovering || !resolving.compareAndSet(false, true)) return;
    ResolveCandidate candidate = resolveQueue.poll();
    if (candidate == null) {
      resolving.set(false);
      return;
    }
    try {
      nsdManager.resolveService(candidate.info, new NsdManager.ResolveListener() {
        @Override public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
          resolving.set(false);
          resolveNext();
        }
        @Override public void onServiceResolved(NsdServiceInfo serviceInfo) {
          try {
            if (discovering && candidate.generation == discoveryGeneration) publishResolvedPeer(serviceInfo);
          } finally {
            resolving.set(false);
            resolveNext();
          }
        }
      });
    } catch (Exception error) {
      resolving.set(false);
      resolveNext();
    }
  }

  private void publishResolvedPeer(NsdServiceInfo info) {
    try {
      String id = attribute(info, "id");
      if (!validIdentifier(id) || id.equals(localDeviceId) || info.getHost() == null) return;
      serviceDeviceIds.put(info.getServiceName(), id);
      JSObject peer = new JSObject();
      peer.put("deviceId", id);
      peer.put("name", safeName(attribute(info, "name")));
      peer.put("host", info.getHost().getHostAddress());
      peer.put("port", info.getPort());
      peer.put("platform", safeName(attribute(info, "platform")));
      peer.put("appVersion", safeName(attribute(info, "app")));
      peer.put("online", true);
      peer.put("lastSeenAt", Instant.now().toString());
      notifyListeners("peerFound", peer);
    } catch (Exception ignored) {}
  }

  private String attribute(NsdServiceInfo info, String key) {
    byte[] value = info.getAttributes().get(key);
    return value == null ? "" : new String(value, StandardCharsets.UTF_8);
  }

  private synchronized boolean pairingAllowed(String remoteAddress, String providedCode) {
    long now = System.currentTimeMillis();
    AttemptWindow attempt = pairingAttempts.computeIfAbsent(remoteAddress, ignored -> new AttemptWindow(now));
    if (attempt.blockedUntil > now) return false;
    boolean valid = hosting && now < pairingExpiresAt && pairingCode.equals(providedCode);
    if (valid) {
      pairingAttempts.remove(remoteAddress);
      return true;
    }
    if (now - attempt.windowStartedAt > FAILURE_WINDOW_MS) {
      attempt.windowStartedAt = now;
      attempt.failures = 0;
    }
    attempt.failures += 1;
    if (attempt.failures >= MAX_PAIRING_FAILURES) attempt.blockedUntil = now + BLOCK_TIME_MS;
    return false;
  }

  private synchronized void rotatePairingCode(boolean notify) {
    pairingCode = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
    sessionId = UUID.randomUUID().toString();
    pairingExpiresAt = System.currentTimeMillis() + PAIRING_LIFETIME_MS;
    pairingAttempts.clear();
    if (notify && hosting) notifyListeners("hostingChanged", hostingInfo());
  }

  private JSObject hostingInfo() {
    JSObject result = new JSObject();
    result.put("deviceId", localDeviceId);
    result.put("name", deviceName());
    result.put("address", localAddress);
    result.put("port", localPort);
    result.put("pairingCode", pairingCode);
    result.put("sessionId", sessionId);
    result.put("expiresAt", Instant.ofEpochMilli(pairingExpiresAt).toString());
    return result;
  }

  private void stopHostingInternal() {
    hosting = false;
    if (pairingRotation != null) {
      pairingRotation.cancel(true);
      pairingRotation = null;
    }
    if (registrationListener != null && nsdManager != null) {
      try { nsdManager.unregisterService(registrationListener); } catch (Exception ignored) {}
      registrationListener = null;
    }
    closeQuietly(serverSocket);
    serverSocket = null;
    localPort = 0;
    localAddress = "";
    pairingCode = "";
    sessionId = "";
    cancelIncoming();
    releaseMulticastLockIfIdle();
  }

  private void stopDiscoveryInternal() {
    discovering = false;
    discoveryGeneration += 1;
    resolveQueue.clear();
    serviceDeviceIds.clear();
    if (discoveryListener != null && nsdManager != null) {
      try { nsdManager.stopServiceDiscovery(discoveryListener); } catch (Exception ignored) {}
      discoveryListener = null;
    }
    releaseMulticastLockIfIdle();
  }

  private void cancelIncoming() {
    for (String requestId : new ArrayList<>(incoming.keySet())) removeIncoming(requestId);
  }

  private void expireIncoming(String requestId) {
    PendingIncoming pending = incoming.remove(requestId);
    if (pending == null) return;
    try { writeFrame(pending.output, errorFrame(requestId, "REQUEST_TIMEOUT")); } catch (Exception ignored) {}
    pending.close();
  }

  private void expirePull(String requestId) {
    PendingPull pending = outgoingPulls.remove(requestId);
    if (pending != null) pending.close();
  }

  private void removeIncoming(String requestId) {
    PendingIncoming pending = incoming.remove(requestId);
    if (pending != null) pending.close();
  }

  private void acquireMulticastLock() {
    if (multicastLock != null && multicastLock.isHeld()) return;
    WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
    if (wifi == null) return;
    multicastLock = wifi.createMulticastLock("kgc-device-sync");
    multicastLock.setReferenceCounted(false);
    multicastLock.acquire();
  }

  private void releaseMulticastLockIfIdle() {
    if ((hosting || discovering) || multicastLock == null) return;
    try { if (multicastLock.isHeld()) multicastLock.release(); } catch (Exception ignored) {}
    multicastLock = null;
  }

  private String findLocalIpv4() throws IOException {
    Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
    if (interfaces == null) return "";
    for (NetworkInterface network : Collections.list(interfaces)) {
      if (!network.isUp() || network.isLoopback()) continue;
      String name = network.getName().toLowerCase(Locale.ROOT);
      if (!(name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("eth"))) continue;
      for (InetAddress address : Collections.list(network.getInetAddresses())) {
        if (address instanceof Inet4Address && !address.isLoopbackAddress() && !address.isLinkLocalAddress()) {
          return address.getHostAddress();
        }
      }
    }
    return "";
  }

  private static DataInputStream input(Socket socket) throws IOException {
    return new DataInputStream(new BufferedInputStream(socket.getInputStream()));
  }

  private static DataOutputStream output(Socket socket) throws IOException {
    return new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));
  }

  private static synchronized void writeFrame(DataOutputStream output, JSONObject value) throws IOException {
    byte[] bytes = value.toString().getBytes(StandardCharsets.UTF_8);
    if (bytes.length <= 0 || bytes.length > MAX_FRAME_BYTES) throw new IOException("FRAME_TOO_LARGE");
    output.writeInt(bytes.length);
    output.write(bytes);
    output.flush();
  }

  private static JSONObject readFrame(DataInputStream input) throws IOException, JSONException {
    int length = input.readInt();
    if (length <= 0 || length > MAX_FRAME_BYTES) throw new IOException("FRAME_TOO_LARGE");
    byte[] bytes = new byte[length];
    input.readFully(bytes);
    return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
  }

  private static void validateTransfer(JSONObject transfer) throws Exception {
    if (transfer.optInt("transferFormatVersion", 0) != 1) throw new ProtocolException("TRANSFER_VERSION_INCOMPATIBLE");
    String snapshot = transfer.optString("snapshotJson", "");
    byte[] bytes = snapshot.getBytes(StandardCharsets.UTF_8);
    if (bytes.length == 0 || bytes.length > 8 * 1024 * 1024) throw new ProtocolException("SNAPSHOT_TOO_LARGE");
    if (transfer.optInt("snapshotUtf8Bytes", -1) != bytes.length) throw new ProtocolException("SNAPSHOT_SIZE_MISMATCH");
    if (!sha256(snapshot).equalsIgnoreCase(transfer.optString("snapshotSha256", ""))) throw new ProtocolException("SNAPSHOT_DIGEST_MISMATCH");
    JSONObject envelope = new JSONObject(snapshot);
    if (envelope.optInt("schemaVersion", 0) != 3 || envelope.optJSONObject("state") == null) {
      throw new ProtocolException("UNSUPPORTED_STATE_VERSION");
    }
    if (transfer.optJSONObject("summary") == null) throw new ProtocolException("SUMMARY_MISSING");
  }

  private static JSONObject resultFrame(String requestId, boolean committed, String error) throws JSONException {
    JSONObject result = new JSONObject();
    result.put("kind", committed ? "committed" : ("REJECTED".equals(error) ? "rejected" : "failed"));
    result.put("requestId", requestId);
    if (!committed && error != null && !error.isEmpty()) result.put("error", error);
    return result;
  }

  private static JSONObject errorFrame(String requestId, String code) throws JSONException {
    JSONObject result = new JSONObject();
    result.put("kind", "error");
    result.put("requestId", requestId);
    result.put("error", code);
    return result;
  }

  private static void requireKind(JSONObject response, String requestId, String expected) throws ProtocolException {
    if (!requestId.equals(response.optString("requestId", ""))) throw new ProtocolException("REQUEST_ID_MISMATCH");
    String kind = response.optString("kind", "");
    if (expected.equals(kind)) return;
    if ("rejected".equals(kind)) throw new ProtocolException("REJECTED");
    if ("error".equals(kind) || "failed".equals(kind)) throw new ProtocolException(response.optString("error", "REMOTE_FAILED"));
    throw new ProtocolException("UNEXPECTED_RESPONSE");
  }

  private File recoveryDirectory() throws IOException {
    File directory = new File(getContext().getFilesDir(), "device-sync-recovery");
    if (!directory.exists() && !directory.mkdirs()) throw new IOException("RECOVERY_DIRECTORY_FAILED");
    return directory;
  }

  private void atomicWrite(File target, String value) throws IOException {
    File temporary = new File(target.getParentFile(), target.getName() + ".tmp");
    try (FileOutputStream stream = new FileOutputStream(temporary)) {
      stream.write(value.getBytes(StandardCharsets.UTF_8));
      stream.flush();
      stream.getFD().sync();
    }
    if (target.exists() && !target.delete()) throw new IOException("RECOVERY_REPLACE_FAILED");
    if (!temporary.renameTo(target)) throw new IOException("RECOVERY_RENAME_FAILED");
  }

  private JSONObject readJson(File file) throws Exception {
    if (!file.exists() || file.length() <= 0 || file.length() > MAX_RECOVERY_BYTES * 2L) throw new IOException("RECOVERY_NOT_FOUND");
    byte[] bytes = new byte[(int) file.length()];
    try (FileInputStream stream = new FileInputStream(file)) {
      int offset = 0;
      while (offset < bytes.length) {
        int count = stream.read(bytes, offset, bytes.length - offset);
        if (count < 0) throw new IOException("RECOVERY_TRUNCATED");
        offset += count;
      }
    }
    return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
  }

  private List<JSONObject> readRecoveryWrappers() throws Exception {
    File[] files = recoveryDirectory().listFiles((directory, name) -> name.matches("[0-9]+-[a-f0-9]{8}\\.json"));
    List<JSONObject> wrappers = new ArrayList<>();
    if (files != null) {
      for (File file : files) {
        try {
          JSONObject wrapper = readJson(file);
          validateRecoveryWrapper(wrapper);
          wrappers.add(wrapper);
        } catch (Exception ignored) {
          // A damaged point is omitted rather than exposed as restorable.
        }
      }
    }
    wrappers.sort((left, right) -> right.optString("createdAt", "").compareTo(left.optString("createdAt", "")));
    return wrappers;
  }

  private void validateRecoveryWrapper(JSONObject wrapper) throws Exception {
    if (wrapper.optInt("formatVersion", 0) != 1) throw new IOException("RECOVERY_VERSION_INVALID");
    String bundle = wrapper.optString("bundleJson", "");
    byte[] bytes = bundle.getBytes(StandardCharsets.UTF_8);
    if (bytes.length == 0 || bytes.length != wrapper.optInt("utf8Bytes", -1)) throw new IOException("RECOVERY_SIZE_MISMATCH");
    if (!sha256(bundle).equalsIgnoreCase(wrapper.optString("sha256", ""))) throw new IOException("RECOVERY_DIGEST_MISMATCH");
    JSONObject parsed = new JSONObject(bundle);
    if (parsed.optInt("formatVersion", 0) != 1 || parsed.optJSONObject("transfer") == null) throw new IOException("RECOVERY_BUNDLE_INVALID");
    validateTransfer(parsed.getJSONObject("transfer"));
  }

  private JSObject recoveryMetadata(JSONObject wrapper) throws JSONException {
    JSObject point = new JSObject();
    point.put("id", wrapper.getString("id"));
    point.put("createdAt", wrapper.getString("createdAt"));
    point.put("sourceName", wrapper.optString("sourceName", "设备传输前"));
    point.put("sourceDeviceId", wrapper.optString("sourceDeviceId", ""));
    point.put("utf8Bytes", wrapper.getInt("utf8Bytes"));
    point.put("sha256", wrapper.getString("sha256"));
    point.put("summary", wrapper.getJSONObject("summary"));
    return point;
  }

  private void pruneRecoveryPoints(File directory) throws Exception {
    List<JSONObject> wrappers = readRecoveryWrappers();
    for (int index = 5; index < wrappers.size(); index += 1) {
      File file = new File(directory, wrappers.get(index).optString("id") + ".json");
      if (file.exists()) file.delete();
    }
  }

  private static String sha256(String value) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
    StringBuilder builder = new StringBuilder(hash.length * 2);
    for (byte item : hash) builder.append(String.format(Locale.ROOT, "%02x", item & 0xff));
    return builder.toString();
  }

  private void notifyError(String code, int nativeCode) {
    JSObject event = new JSObject();
    event.put("code", code);
    event.put("nativeCode", nativeCode);
    notifyListeners("deviceSyncError", event);
  }

  private void rejectNetwork(PluginCall call, Exception error, String fallback) {
    String code;
    if (error instanceof SocketTimeoutException) code = "REQUEST_TIMEOUT";
    else if (error instanceof ProtocolException) code = error.getMessage();
    else code = fallback;
    call.reject(code, code, error);
  }

  private static String errorCode(Exception error, String fallback) {
    String message = error.getMessage();
    return message == null || message.trim().isEmpty() ? fallback : message.trim();
  }

  private static String normalized(String value) {
    return value == null ? "" : value.trim();
  }

  private static boolean validIdentifier(String value) {
    return value != null && value.length() >= 8 && value.length() <= 128 && !value.matches(".*[\\x00-\\x1f\\x7f].*");
  }

  private static String safeName(String value) {
    String normalized = normalized(value).replaceAll("[\\x00-\\x1f\\x7f]", "");
    if (normalized.isEmpty()) return "Android 设备";
    return normalized.substring(0, Math.min(80, normalized.length()));
  }

  private static String deviceName() {
    String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim();
    String model = Build.MODEL == null ? "Android 设备" : Build.MODEL.trim();
    if (model.toLowerCase(Locale.ROOT).startsWith(manufacturer.toLowerCase(Locale.ROOT))) return safeName(model);
    return safeName((manufacturer + " " + model).trim());
  }

  private static void closeQuietly(Socket socket) {
    if (socket == null) return;
    try { socket.close(); } catch (IOException ignored) {}
  }

  private static void closeQuietly(ServerSocket socket) {
    if (socket == null) return;
    try { socket.close(); } catch (IOException ignored) {}
  }

  @Override
  protected void handleOnPause() {
    // Discovery is only useful while the list is visible. Keep an explicitly
    // enabled host and any approved socket alive across brief system pauses.
    stopDiscoveryInternal();
  }

  @Override
  protected void handleOnDestroy() {
    stopHostingInternal();
    stopDiscoveryInternal();
    cancelIncoming();
    for (PendingPull pending : outgoingPulls.values()) pending.close();
    outgoingPulls.clear();
    io.shutdownNow();
    scheduler.shutdownNow();
  }

  private enum PendingState { WAITING_APPROVAL, APPROVED, WAITING_SNAPSHOT, WAITING_LOCAL_COMMIT, WAITING_REMOTE_COMMIT }

  private static final class PendingIncoming {
    final String requestId;
    final String kind;
    final Socket socket;
    final DataInputStream input;
    final DataOutputStream output;
    final JSONObject sourceDevice;
    final java.util.concurrent.atomic.AtomicReference<PendingState> state = new java.util.concurrent.atomic.AtomicReference<>(PendingState.WAITING_APPROVAL);

    PendingIncoming(String requestId, String kind, Socket socket, DataInputStream input, DataOutputStream output, JSONObject sourceDevice) {
      this.requestId = requestId;
      this.kind = kind;
      this.socket = socket;
      this.input = input;
      this.output = output;
      this.sourceDevice = sourceDevice;
    }

    void close() { closeQuietly(socket); }
  }

  private static final class PendingPull {
    final String requestId;
    final Socket socket;
    final DataInputStream input;
    final DataOutputStream output;

    PendingPull(String requestId, Socket socket, DataInputStream input, DataOutputStream output) {
      this.requestId = requestId;
      this.socket = socket;
      this.input = input;
      this.output = output;
    }

    void close() { closeQuietly(socket); }
  }

  private static final class AttemptWindow {
    long windowStartedAt;
    int failures;
    long blockedUntil;
    AttemptWindow(long startedAt) { windowStartedAt = startedAt; }
  }

  private static final class ResolveCandidate {
    final NsdServiceInfo info;
    final int generation;
    ResolveCandidate(NsdServiceInfo info, int generation) { this.info = info; this.generation = generation; }
  }

  private static final class ProtocolException extends Exception {
    ProtocolException(String code) { super(code); }
  }
}
