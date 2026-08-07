package com.wjy.kaogong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class DownloadCancellationPolicyTest {
    @Test
    public void completedDownloadsArePreservedWithoutRemoval() {
        assertEquals(
            DownloadCancellationPolicy.Action.PRESERVE_COMPLETED,
            DownloadCancellationPolicy.actionFor(true, true, "downloaded")
        );
    }

    @Test
    public void missingRecordsAreForgottenWithoutRemoval() {
        assertEquals(
            DownloadCancellationPolicy.Action.FORGET_MISSING,
            DownloadCancellationPolicy.actionFor(true, true, "not_found")
        );
    }

    @Test
    public void activeAndFailedRecordsRequireRemoval() {
        assertEquals(DownloadCancellationPolicy.Action.REMOVE, DownloadCancellationPolicy.actionFor(true, true, "queued"));
        assertEquals(DownloadCancellationPolicy.Action.REMOVE, DownloadCancellationPolicy.actionFor(true, true, "downloading"));
        assertEquals(DownloadCancellationPolicy.Action.REMOVE, DownloadCancellationPolicy.actionFor(true, true, "paused"));
        assertEquals(DownloadCancellationPolicy.Action.REMOVE, DownloadCancellationPolicy.actionFor(true, true, "failed"));
    }

    @Test
    public void unavailableManagerAndFailedQueriesNeverForgetTracking() {
        assertEquals(
            DownloadCancellationPolicy.Action.FAIL,
            DownloadCancellationPolicy.actionFor(false, false, "not_found")
        );
        assertEquals(
            DownloadCancellationPolicy.Action.FAIL,
            DownloadCancellationPolicy.actionFor(true, false, "not_found")
        );
    }

    @Test
    public void onlyPositiveRemovalCountsAreSuccessful() {
        assertFalse(DownloadCancellationPolicy.removalSucceeded(0));
        assertFalse(DownloadCancellationPolicy.removalSucceeded(-1));
        assertTrue(DownloadCancellationPolicy.removalSucceeded(1));
    }

    @Test
    public void queryFailuresStayUnknownAndNonTerminal() {
        assertEquals("unknown", DownloadCancellationPolicy.publicState(false, "not_found"));
        assertFalse(DownloadCancellationPolicy.isTerminal(false, "not_found"));
        assertEquals(
            DownloadCancellationPolicy.StartAction.REJECT_STATUS_UNAVAILABLE,
            DownloadCancellationPolicy.startAction(false, "not_found")
        );
    }

    @Test
    public void confirmedTerminalStatesRemainTerminal() {
        assertTrue(DownloadCancellationPolicy.isTerminal(true, "downloaded"));
        assertTrue(DownloadCancellationPolicy.isTerminal(true, "failed"));
        assertTrue(DownloadCancellationPolicy.isTerminal(true, "not_found"));
        assertFalse(DownloadCancellationPolicy.isTerminal(true, "downloading"));
    }

    @Test
    public void startOnlyClearsConfirmedFailedOrMissingRecords() {
        assertEquals(
            DownloadCancellationPolicy.StartAction.CLEAR_REUSABLE_RECORD,
            DownloadCancellationPolicy.startAction(true, "failed")
        );
        assertEquals(
            DownloadCancellationPolicy.StartAction.CLEAR_REUSABLE_RECORD,
            DownloadCancellationPolicy.startAction(true, "not_found")
        );
        assertEquals(
            DownloadCancellationPolicy.StartAction.REJECT_IN_PROGRESS,
            DownloadCancellationPolicy.startAction(true, "downloading")
        );
        assertEquals(
            DownloadCancellationPolicy.StartAction.REJECT_READY,
            DownloadCancellationPolicy.startAction(true, "downloaded")
        );
        assertEquals(
            DownloadCancellationPolicy.StartAction.REJECT_STATUS_UNAVAILABLE,
            DownloadCancellationPolicy.startAction(true, "unknown")
        );
    }
}
