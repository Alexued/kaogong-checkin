"""One-peer protocol simulator for the single-ADB-device QA path."""
import argparse
import hashlib
import json
import socket
import struct
import sys
import time
import uuid


def frame(sock, value):
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    sock.sendall(struct.pack(">I", len(raw)) + raw)


def read_exact(sock, size):
    chunks = bytearray()
    while len(chunks) < size:
        chunk = sock.recv(size - len(chunks))
        if not chunk:
            raise RuntimeError("connection closed during frame")
        chunks.extend(chunk)
    return bytes(chunks)


def read_frame(sock):
    header = read_exact(sock, 4)
    size = struct.unpack(">I", header)[0]
    if size <= 0 or size > 10 * 1024 * 1024:
        raise RuntimeError(f"invalid frame size: {size}")
    return json.loads(read_exact(sock, size).decode("utf-8"))


def simulator_envelope():
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    task_id = "sim-task-123456"
    return {
        "schemaVersion": 3,
        "revision": 9001,
        "deviceId": "simulator-device-1234",
        "savedAt": now,
        "state": {
            "tasks": [{
                "id": task_id,
                "title": "协议模拟任务",
                "schedule": {"kind": "daily", "startDate": "2026-08-11", "endDate": None},
                "completion": {"kind": "checklist", "target": 1, "unit": ""},
                "subtasks": [],
                "order": 0,
                "archivedAt": None,
                "deletedAt": None,
                "createdAt": now,
                "updatedAt": now,
            }],
            "dailyProgress": [],
            "timerSessions": [],
            "drillAttempts": [],
            "speedAttempts": [],
            "analysisReviews": [],
            "settings": {
                "appMode": "general",
                "planEndDate": None,
                "theme": "light",
                "markDate": None,
                "startupAnimationEnabled": True,
                "timerLapFontSize": 17,
            },
        },
    }


def validate_transfer(transfer):
    snapshot = transfer.get("snapshotJson", "")
    raw = snapshot.encode("utf-8")
    if transfer.get("transferFormatVersion") != 1:
        raise RuntimeError("transfer version mismatch")
    if transfer.get("snapshotUtf8Bytes") != len(raw):
        raise RuntimeError("snapshot size mismatch")
    if transfer.get("snapshotSha256") != hashlib.sha256(raw).hexdigest():
        raise RuntimeError("snapshot digest mismatch")
    envelope = json.loads(snapshot)
    if envelope.get("schemaVersion") != 3:
        raise RuntimeError("snapshot schema mismatch")
    state = envelope.get("state", {})
    for key in ("tasks", "dailyProgress", "timerSessions", "drillAttempts", "speedAttempts", "analysisReviews"):
        if not isinstance(state.get(key), list):
            raise RuntimeError(f"snapshot collection missing: {key}")
    return envelope


def source_device(now):
    return {
        "deviceId": "simulator-device-1234",
        "name": "桌面协议模拟器",
        "host": "127.0.0.1",
        "port": 0,
        "platform": "Desktop simulator",
        "appVersion": "test",
        "online": True,
        "lastSeenAt": now,
    }


def offer(args, kind, request_id, now):
    return {
        "protocolVersion": args.protocol_version,
        "requestId": request_id,
        "kind": kind,
        "sourceDevice": source_device(now),
        "targetDeviceId": args.target_device,
        "createdAt": now,
        "pairingCode": args.code,
    }


def pull_from_phone(args):
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    request_id = str(uuid.uuid4())
    with socket.create_connection((args.host, args.port), timeout=8) as sock:
        sock.settimeout(120)
        frame(sock, offer(args, "pull-offer", request_id, now))
        response = read_frame(sock)
        print(json.dumps({"stage": "pull-snapshot", "kind": response.get("kind")}, ensure_ascii=False), flush=True)
        if response.get("kind") != "snapshot" or response.get("requestId") != request_id:
            raise RuntimeError(f"unexpected pull response: {response}")
        transfer = response.get("transfer", {})
        envelope = validate_transfer(transfer)
        state = envelope["state"]
        summary = {
            "sha256": transfer["snapshotSha256"],
            "utf8Bytes": transfer["snapshotUtf8Bytes"],
            "revision": envelope["revision"],
            "tasks": len(state["tasks"]),
            "timers": len(state["timerSessions"]),
            "pomodoroTimers": sum(1 for item in state["timerSessions"] if item.get("mode") == "pomodoro"),
            "speeds": len(state["speedAttempts"]),
            "reviews": len(state["analysisReviews"]),
        }
        frame(sock, {"kind": "committed", "requestId": request_id})
        print(json.dumps({"stage": "pull-verified", "summary": summary}, ensure_ascii=False), flush=True)
        return transfer, summary


def push_to_phone(args, transfer):
    envelope = validate_transfer(transfer)
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    request_id = str(uuid.uuid4())
    request = offer(args, "push-offer", request_id, now)
    request.update({
        "summary": transfer["summary"],
        "snapshotSha256": transfer["snapshotSha256"],
        "snapshotUtf8Bytes": transfer["snapshotUtf8Bytes"],
    })
    with socket.create_connection((args.host, args.port), timeout=8) as sock:
        sock.settimeout(120)
        frame(sock, request)
        response = read_frame(sock)
        print(json.dumps({"stage": "push-approval", "response": response}, ensure_ascii=False), flush=True)
        if response.get("kind") != "ready":
            raise RuntimeError(f"unexpected push approval: {response}")
        frame(sock, {"kind": "snapshot", "requestId": request_id, "transfer": transfer})
        result = read_frame(sock)
        print(json.dumps({
            "stage": "push-complete",
            "response": result,
            "sourceRevision": envelope["revision"],
        }, ensure_ascii=False), flush=True)
        if result.get("kind") != "committed":
            raise RuntimeError(f"push not committed: {result}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--code", required=True)
    parser.add_argument("--target-device", required=True)
    parser.add_argument("--protocol-version", type=int, default=1)
    parser.add_argument("--mode", choices=("push", "pull", "roundtrip"), default="push")
    parser.add_argument("--corrupt-sha", action="store_true")
    parser.add_argument("--corrupt-size", action="store_true")
    args = parser.parse_args()

    if args.mode in ("pull", "roundtrip"):
        pulled, summary = pull_from_phone(args)
        if args.mode == "roundtrip":
            push_to_phone(args, pulled)
            print(json.dumps({"stage": "roundtrip-complete", "summary": summary}, ensure_ascii=False), flush=True)
        return 0

    envelope = simulator_envelope()
    snapshot = json.dumps(envelope, ensure_ascii=False, separators=(",", ":"))
    transfer = {
        "transferFormatVersion": 1,
        "snapshotJson": snapshot,
        "snapshotSha256": hashlib.sha256(snapshot.encode("utf-8")).hexdigest(),
        "snapshotUtf8Bytes": len(snapshot.encode("utf-8")),
        "summary": {
            "appMode": "general",
            "taskCount": 1,
            "progressCount": 0,
            "timerCount": 0,
            "drillCount": 0,
            "savedAt": envelope["savedAt"],
        },
    }
    if args.corrupt_sha:
        transfer["snapshotSha256"] = "0" * 64
    if args.corrupt_size:
        transfer["snapshotUtf8Bytes"] += 1
    request_id = str(uuid.uuid4())
    request = offer(args, "push-offer", request_id, envelope["savedAt"])
    request.update({
        "summary": transfer["summary"],
        "snapshotSha256": transfer["snapshotSha256"],
        "snapshotUtf8Bytes": transfer["snapshotUtf8Bytes"],
    })
    with socket.create_connection((args.host, args.port), timeout=8) as sock:
        sock.settimeout(120)
        frame(sock, request)
        response = read_frame(sock)
        print(json.dumps({"stage": "approval", "response": response}, ensure_ascii=False), flush=True)
        if response.get("kind") != "ready":
            return 2
        frame(sock, {"kind": "snapshot", "requestId": request_id, "transfer": transfer})
        result = read_frame(sock)
        print(json.dumps({"stage": "complete", "response": result}, ensure_ascii=False), flush=True)
        return 0 if result.get("kind") == "committed" else 3


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"stage": "error", "error": str(exc)}, ensure_ascii=False), flush=True)
        raise
