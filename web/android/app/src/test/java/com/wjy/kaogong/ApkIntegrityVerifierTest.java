package com.wjy.kaogong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;

import org.junit.Test;

public class ApkIntegrityVerifierTest {
    @Test
    public void normalizesGitHubAndPlainDigests() {
        char[] characters = new char[64];
        Arrays.fill(characters, 'A');
        String digest = new String(characters);
        assertEquals(digest.toLowerCase(), ApkIntegrityVerifier.normalizeExpectedSha256(digest));
        assertEquals(digest.toLowerCase(), ApkIntegrityVerifier.normalizeExpectedSha256("sha256:" + digest));
        assertNull(ApkIntegrityVerifier.normalizeExpectedSha256(null));
        assertNull(ApkIntegrityVerifier.normalizeExpectedSha256("sha256:not-a-digest"));
    }

    @Test
    public void hashesTheDownloadedFileAsAStream() throws Exception {
        File fixture = File.createTempFile("kaogong-update-", ".apk");
        try {
            Files.write(fixture.toPath(), "verified apk".getBytes(StandardCharsets.UTF_8));
            assertEquals(
                "97bd5a88552319b46e3d5ed350451b18a7558170aa11d7947452c62365c75403",
                ApkIntegrityVerifier.sha256(fixture)
            );
        } finally {
            //noinspection ResultOfMethodCallIgnored
            fixture.delete();
        }
    }

    @Test
    public void aMatchingDigestPreservesTheApk() throws Exception {
        File fixture = File.createTempFile("kaogong-update-match-", ".apk");
        try {
            Files.write(fixture.toPath(), "verified apk".getBytes(StandardCharsets.UTF_8));
            assertTrue(ApkIntegrityVerifier.verifyAndDeleteOnMismatch(
                fixture,
                "97bd5a88552319b46e3d5ed350451b18a7558170aa11d7947452c62365c75403"
            ));
            assertTrue(fixture.isFile());
        } finally {
            //noinspection ResultOfMethodCallIgnored
            fixture.delete();
        }
    }

    @Test
    public void aMismatchedDigestDeletesTheApk() throws Exception {
        File fixture = File.createTempFile("kaogong-update-mismatch-", ".apk");
        Files.write(fixture.toPath(), "tampered apk".getBytes(StandardCharsets.UTF_8));

        assertFalse(ApkIntegrityVerifier.verifyAndDeleteOnMismatch(
            fixture,
            "97bd5a88552319b46e3d5ed350451b18a7558170aa11d7947452c62365c75403"
        ));
        assertFalse(fixture.exists());
    }
}
