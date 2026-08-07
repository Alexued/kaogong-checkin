package com.wjy.kaogong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.Test;

public class ApkIntegrityCheckTest {
    @Test
    public void mismatchDiscardsBeforeReturningTheResult() {
        AtomicBoolean discarded = new AtomicBoolean(false);
        ApkIntegrityCheck.Result result = ApkIntegrityCheck.run(
            new File("unused.apk"),
            "a".repeat(64),
            () -> discarded.set(true),
            (file, digest) -> false
        );

        assertTrue(discarded.get());
        assertEquals(ApkIntegrityCheck.Status.MISMATCH, result.status);
    }

    @Test
    public void verificationErrorStillDiscardsWhenUiWasDestroyed() {
        AtomicBoolean destroyed = new AtomicBoolean(true);
        AtomicBoolean discarded = new AtomicBoolean(false);
        AtomicBoolean uiNotified = new AtomicBoolean(false);

        ApkIntegrityCheck.Result result = ApkIntegrityCheck.run(
            new File("missing.apk"),
            "a".repeat(64),
            () -> discarded.set(true),
            (file, digest) -> { throw new IOException("read failed"); }
        );
        if (!destroyed.get()) uiNotified.set(true);

        assertTrue(discarded.get());
        assertFalse(uiNotified.get());
        assertEquals(ApkIntegrityCheck.Status.ERROR, result.status);
        assertNotNull(result.error);
    }

    @Test
    public void successfulVerificationDoesNotDiscard() {
        AtomicBoolean discarded = new AtomicBoolean(false);
        ApkIntegrityCheck.Result result = ApkIntegrityCheck.run(
            new File("unused.apk"),
            "a".repeat(64),
            () -> discarded.set(true),
            (file, digest) -> true
        );

        assertFalse(discarded.get());
        assertEquals(ApkIntegrityCheck.Status.MATCH, result.status);
    }
}
