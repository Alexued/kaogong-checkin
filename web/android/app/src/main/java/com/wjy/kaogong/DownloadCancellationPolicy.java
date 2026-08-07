package com.wjy.kaogong;

final class DownloadCancellationPolicy {
    enum Action {
        FAIL,
        PRESERVE_COMPLETED,
        FORGET_MISSING,
        REMOVE
    }

    enum StartAction {
        REJECT_STATUS_UNAVAILABLE,
        REJECT_IN_PROGRESS,
        REJECT_READY,
        CLEAR_REUSABLE_RECORD
    }

    private DownloadCancellationPolicy() {}

    static Action actionFor(boolean managerAvailable, boolean querySucceeded, String state) {
        if (!managerAvailable || !querySucceeded) {
            return Action.FAIL;
        }
        if ("downloaded".equals(state)) {
            return Action.PRESERVE_COMPLETED;
        }
        if ("not_found".equals(state)) {
            return Action.FORGET_MISSING;
        }
        return Action.REMOVE;
    }

    static boolean removalSucceeded(long removedCount) {
        return removedCount > 0L;
    }

    static StartAction startAction(boolean querySucceeded, String state) {
        if (!querySucceeded) {
            return StartAction.REJECT_STATUS_UNAVAILABLE;
        }
        if ("queued".equals(state) || "downloading".equals(state) || "paused".equals(state)) {
            return StartAction.REJECT_IN_PROGRESS;
        }
        if ("downloaded".equals(state)) {
            return StartAction.REJECT_READY;
        }
        if ("failed".equals(state) || "not_found".equals(state)) {
            return StartAction.CLEAR_REUSABLE_RECORD;
        }
        return StartAction.REJECT_STATUS_UNAVAILABLE;
    }

    static String publicState(boolean querySucceeded, String state) {
        return querySucceeded ? state : "unknown";
    }

    static boolean isTerminal(boolean querySucceeded, String state) {
        return querySucceeded
            && ("downloaded".equals(state) || "failed".equals(state) || "not_found".equals(state));
    }
}
