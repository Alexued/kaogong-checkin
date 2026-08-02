package com.wjy.kaogong;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Downloads APK updates without leaving the application and opens the system
 * installer through the app's existing FileProvider.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    public static final String EVENT_DOWNLOAD_PROGRESS = "downloadProgress";

    private static final String PREFS_NAME = "app_update";
    private static final String PREF_DOWNLOAD_ID = "download_id";
    private static final String PREF_FILE_NAME = "file_name";
    private static final String DEFAULT_FILE_NAME = "kaogong-checkin-update.apk";
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final long NO_DOWNLOAD_ID = -1L;
    private static final long POLL_INTERVAL_MS = 400L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object pollLock = new Object();

    private DownloadManager downloadManager;
    private SharedPreferences preferences;
    private BroadcastReceiver downloadReceiver;
    private ScheduledExecutorService pollExecutor;
    private ScheduledFuture<?> pollTask;
    private long activeDownloadId = NO_DOWNLOAD_ID;
    private String activeFileName = DEFAULT_FILE_NAME;
    private long speedSampleId = NO_DOWNLOAD_ID;
    private long speedSampleBytes = 0L;
    private long speedSampleTime = 0L;
    private volatile boolean destroyed = false;
    private boolean receiverRegistered = false;

    @Override
    public void load() {
        destroyed = false;
        Context context = getContext();
        downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        activeDownloadId = preferences.getLong(PREF_DOWNLOAD_ID, NO_DOWNLOAD_ID);
        activeFileName = preferences.getString(PREF_FILE_NAME, DEFAULT_FILE_NAME);
        registerDownloadReceiver(context);

        if (activeDownloadId != NO_DOWNLOAD_ID) {
            startPolling(activeDownloadId);
        }
    }

    @PluginMethod
    public void startDownload(PluginCall call) {
        String url = call.getString("url");
        if (!isHttpUrl(url)) {
            call.reject("A valid http(s) update URL is required", "INVALID_URL");
            return;
        }
        if (downloadManager == null) {
            call.reject("Download service is unavailable", "UNAVAILABLE");
            return;
        }

        if (activeDownloadId != NO_DOWNLOAD_ID) {
            DownloadSnapshot current = querySnapshot(activeDownloadId);
            if (current.status == DownloadManager.STATUS_PENDING
                || current.status == DownloadManager.STATUS_RUNNING
                || current.status == DownloadManager.STATUS_PAUSED) {
                call.reject("An update download is already in progress", "DOWNLOAD_IN_PROGRESS", snapshotData(current));
                return;
            }
            if (current.status == DownloadManager.STATUS_SUCCESSFUL) {
                call.reject("The downloaded update is ready to install", "DOWNLOAD_ALREADY_AVAILABLE", snapshotData(current));
                return;
            }
            // Remove failed records and partial files before reusing the destination name.
            clearDownloadRecord(true);
        }

        String fileName = sanitizeFileName(call.getString("fileName", DEFAULT_FILE_NAME));
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle(fileName);
            request.setDescription("Downloading app update");
            request.setMimeType(APK_MIME);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, fileName);

            long id = downloadManager.enqueue(request);
            activeDownloadId = id;
            activeFileName = fileName;
            persistDownloadRecord();
            resetSpeedSample(id);
            startPolling(id);

            DownloadSnapshot snapshot = querySnapshot(id);
            JSObject result = snapshotData(snapshot);
            result.put("fileName", fileName);
            call.resolve(result);
        } catch (IllegalArgumentException | SecurityException ex) {
            call.reject("Unable to start update download", "DOWNLOAD_START_FAILED", ex);
        }
    }

    @PluginMethod
    public void getDownloadStatus(PluginCall call) {
        long id = getRequestedDownloadId(call);
        if (id == NO_DOWNLOAD_ID) {
            JSObject result = new JSObject();
            result.put("downloadId", JSObject.NULL);
            result.put("status", "idle");
            result.put("percent", -1);
            result.put("bytesDownloaded", 0L);
            result.put("totalBytes", -1L);
            result.put("speedBytesPerSecond", 0L);
            call.resolve(result);
            return;
        }

        DownloadSnapshot snapshot = querySnapshot(id);
        call.resolve(snapshotData(snapshot));
    }

    @PluginMethod
    public void installDownloadedApk(PluginCall call) {
        long id = getRequestedDownloadId(call);
        if (id == NO_DOWNLOAD_ID) {
            call.reject("No downloaded update is available", "DOWNLOAD_NOT_READY");
            return;
        }

        DownloadSnapshot snapshot = querySnapshot(id);
        if (snapshot.status != DownloadManager.STATUS_SUCCESSFUL) {
            call.reject("The update has not finished downloading", "DOWNLOAD_NOT_READY", snapshotData(snapshot));
            return;
        }

        File apkFile = resolveDownloadedFile(snapshot);
        if (apkFile == null || !apkFile.isFile()) {
            call.reject("The downloaded APK file is missing", "APK_FILE_MISSING");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent permissionIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                permissionIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(permissionIntent);

                JSObject result = new JSObject();
                result.put("downloadId", id);
                result.put("status", "permissionRequired");
                call.resolve(result);
            } catch (ActivityNotFoundException ex) {
                call.reject("Android install permission settings are unavailable", "INSTALL_PERMISSION_UNAVAILABLE", ex);
            }
            return;
        }

        try {
            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apkFile
            );
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(contentUri, APK_MIME);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(installIntent);

            // The installer now owns the APK URI. Forget the active DownloadManager record
            // so the next release can start cleanly after the app process is recreated.
            stopPolling();
            clearDownloadRecord(false);

            JSObject result = new JSObject();
            result.put("downloadId", id);
            result.put("status", "installing");
            call.resolve(result);
        } catch (IllegalArgumentException | ActivityNotFoundException ex) {
            call.reject("Unable to open Android package installer", "INSTALL_FAILED", ex);
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        long id = getRequestedDownloadId(call);
        if (id == NO_DOWNLOAD_ID) {
            call.resolve();
            return;
        }

        String cancelledFileName = activeFileName;
        boolean removed = downloadManager != null && downloadManager.remove(id) > 0;
        if (id == activeDownloadId) {
            stopPolling();
            clearDownloadRecord(false);
        }

        JSObject result = new JSObject();
        result.put("downloadId", id);
        result.put("status", "cancelled");
        result.put("removed", removed);
        call.resolve(result);

        JSObject event = new JSObject();
        event.put("downloadId", id);
        event.put("status", "cancelled");
        event.put("percent", -1);
        event.put("bytesDownloaded", 0L);
        event.put("totalBytes", -1L);
        event.put("speedBytesPerSecond", 0L);
        event.put("fileName", cancelledFileName);
        notifyListeners(EVENT_DOWNLOAD_PROGRESS, event);
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        stopPolling();
        if (pollExecutor != null) {
            pollExecutor.shutdownNow();
            pollExecutor = null;
        }
        if (receiverRegistered && downloadReceiver != null) {
            try {
                getContext().unregisterReceiver(downloadReceiver);
            } catch (IllegalArgumentException ignored) {
                // Receiver was already unregistered by the Android lifecycle.
            }
            receiverRegistered = false;
        }
    }

    private void registerDownloadReceiver(Context context) {
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context receiverContext, Intent intent) {
                if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                    return;
                }
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, NO_DOWNLOAD_ID);
                if (id == activeDownloadId) {
                    emitCurrentSnapshot(id);
                    DownloadSnapshot snapshot = querySnapshot(id);
                    if (snapshot.isTerminal()) {
                        stopPolling();
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            context.registerReceiver(downloadReceiver, filter);
        }
        receiverRegistered = true;
    }

    private void startPolling(long id) {
        synchronized (pollLock) {
            stopPollingLocked();
            if (pollExecutor == null || pollExecutor.isShutdown()) {
                pollExecutor = Executors.newSingleThreadScheduledExecutor(runnable -> {
                    Thread thread = new Thread(runnable, "app-update-progress");
                    thread.setDaemon(true);
                    return thread;
                });
            }
            pollTask = pollExecutor.scheduleAtFixedRate(() -> {
                if (destroyed || id != activeDownloadId) {
                    return;
                }
                DownloadSnapshot snapshot = querySnapshot(id);
                emitSnapshot(snapshot);
                if (snapshot.isTerminal()) {
                    stopPolling();
                }
            }, 0L, POLL_INTERVAL_MS, TimeUnit.MILLISECONDS);
        }
    }

    private void stopPolling() {
        synchronized (pollLock) {
            stopPollingLocked();
        }
    }

    private void stopPollingLocked() {
        if (pollTask != null) {
            pollTask.cancel(false);
            pollTask = null;
        }
    }

    private void emitCurrentSnapshot(long id) {
        emitSnapshot(querySnapshot(id));
    }

    private void emitSnapshot(DownloadSnapshot snapshot) {
        if (destroyed || snapshot.id == NO_DOWNLOAD_ID) {
            return;
        }
        JSObject event = snapshotData(snapshot);
        if (snapshot.id == activeDownloadId) {
            event.put("fileName", activeFileName);
        }
        mainHandler.post(() -> {
            if (!destroyed) {
                notifyListeners(EVENT_DOWNLOAD_PROGRESS, event);
            }
        });
    }

    private DownloadSnapshot querySnapshot(long id) {
        if (downloadManager == null || id == NO_DOWNLOAD_ID) {
            return DownloadSnapshot.notFound(id);
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
        try (android.database.Cursor cursor = downloadManager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                return DownloadSnapshot.notFound(id);
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
            String localUri = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI));
            int percent = total > 0 ? (int) Math.min(100L, Math.round(bytes * 100.0d / total)) : -1;
            long speed = sampleSpeed(id, bytes);
            return new DownloadSnapshot(id, status, bytes, total, percent, speed, reason, localUri);
        } catch (RuntimeException ex) {
            return DownloadSnapshot.notFound(id);
        }
    }

    private long sampleSpeed(long id, long bytes) {
        synchronized (pollLock) {
            long now = System.currentTimeMillis();
            long speed = 0L;
            if (speedSampleId == id && speedSampleTime > 0L && now > speedSampleTime && bytes >= speedSampleBytes) {
                speed = Math.max(0L, Math.round((bytes - speedSampleBytes) * 1000.0d / (now - speedSampleTime)));
            }
            speedSampleId = id;
            speedSampleBytes = bytes;
            speedSampleTime = now;
            return speed;
        }
    }

    private JSObject snapshotData(DownloadSnapshot snapshot) {
        JSObject result = new JSObject();
        if (snapshot.id == NO_DOWNLOAD_ID) {
            result.put("downloadId", JSObject.NULL);
        } else {
            result.put("downloadId", snapshot.id);
        }
        result.put("status", snapshot.state());
        result.put("percent", snapshot.percent);
        result.put("bytesDownloaded", snapshot.bytesDownloaded);
        result.put("totalBytes", snapshot.totalBytes);
        result.put("speedBytesPerSecond", snapshot.speedBytesPerSecond);
        if (snapshot.reason != 0) {
            result.put("reason", snapshot.reason);
        }
        if (snapshot.localUri != null) {
            result.put("localUri", snapshot.localUri);
        }
        if (snapshot.id == activeDownloadId) {
            result.put("fileName", activeFileName);
        }
        return result;
    }

    private File resolveDownloadedFile(DownloadSnapshot snapshot) {
        if (snapshot.localUri != null) {
            Uri localUri = Uri.parse(snapshot.localUri);
            if ("file".equalsIgnoreCase(localUri.getScheme()) && localUri.getPath() != null) {
                File localFile = new File(localUri.getPath());
                if (localFile.isFile()) {
                    return localFile;
                }
            }
        }

        File downloadsDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (downloadsDir == null) {
            return null;
        }
        File destination = new File(downloadsDir, activeFileName);
        return destination.isFile() ? destination : null;
    }

    private long getRequestedDownloadId(PluginCall call) {
        Object rawId = call.getData().opt("downloadId");
        if (rawId instanceof Number) {
            return ((Number) rawId).longValue();
        }
        if (rawId instanceof String) {
            try {
                return Long.parseLong((String) rawId);
            } catch (NumberFormatException ignored) {
                return NO_DOWNLOAD_ID;
            }
        }
        return activeDownloadId;
    }

    private void persistDownloadRecord() {
        preferences.edit()
            .putLong(PREF_DOWNLOAD_ID, activeDownloadId)
            .putString(PREF_FILE_NAME, activeFileName)
            .apply();
    }

    private void clearDownloadRecord(boolean removeFromManager) {
        long id = activeDownloadId;
        String fileName = activeFileName;
        if (removeFromManager && downloadManager != null && id != NO_DOWNLOAD_ID) {
            downloadManager.remove(id);
        }
        if (removeFromManager) {
            File downloadsDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (downloadsDir != null) {
                File destination = new File(downloadsDir, fileName);
                if (destination.isFile()) {
                    //noinspection ResultOfMethodCallIgnored
                    destination.delete();
                }
            }
        }
        activeDownloadId = NO_DOWNLOAD_ID;
        activeFileName = DEFAULT_FILE_NAME;
        if (preferences != null) {
            preferences.edit().remove(PREF_DOWNLOAD_ID).remove(PREF_FILE_NAME).apply();
        }
        resetSpeedSample(NO_DOWNLOAD_ID);
    }

    private void resetSpeedSample(long id) {
        synchronized (pollLock) {
            speedSampleId = id;
            speedSampleBytes = 0L;
            speedSampleTime = 0L;
        }
    }

    private static boolean isHttpUrl(String url) {
        if (url == null || url.trim().isEmpty()) {
            return false;
        }
        Uri uri = Uri.parse(url.trim());
        String scheme = uri.getScheme();
        return uri.getHost() != null && ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme));
    }

    private static String sanitizeFileName(String rawFileName) {
        String fileName = rawFileName == null ? DEFAULT_FILE_NAME : rawFileName.trim();
        if (fileName.isEmpty()) {
            fileName = DEFAULT_FILE_NAME;
        }
        fileName = fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (!fileName.toLowerCase(Locale.US).endsWith(".apk")) {
            fileName += ".apk";
        }
        return fileName;
    }

    private static final class DownloadSnapshot {
        final long id;
        final int status;
        final long bytesDownloaded;
        final long totalBytes;
        final int percent;
        final long speedBytesPerSecond;
        final int reason;
        final String localUri;

        DownloadSnapshot(long id, int status, long bytesDownloaded, long totalBytes, int percent,
                         long speedBytesPerSecond, int reason, String localUri) {
            this.id = id;
            this.status = status;
            this.bytesDownloaded = bytesDownloaded;
            this.totalBytes = totalBytes;
            this.percent = percent;
            this.speedBytesPerSecond = speedBytesPerSecond;
            this.reason = reason;
            this.localUri = localUri;
        }

        static DownloadSnapshot notFound(long id) {
            return new DownloadSnapshot(id, -1, 0L, -1L, -1, 0L, 0, null);
        }

        boolean isTerminal() {
            return status == DownloadManager.STATUS_SUCCESSFUL
                || status == DownloadManager.STATUS_FAILED
                || status == -1;
        }

        String state() {
            switch (status) {
                case DownloadManager.STATUS_PENDING:
                    return "queued";
                case DownloadManager.STATUS_RUNNING:
                    return "downloading";
                case DownloadManager.STATUS_PAUSED:
                    return "paused";
                case DownloadManager.STATUS_SUCCESSFUL:
                    return "downloaded";
                case DownloadManager.STATUS_FAILED:
                    return "failed";
                case -1:
                    return "not_found";
                default:
                    return "unknown";
            }
        }
    }
}
