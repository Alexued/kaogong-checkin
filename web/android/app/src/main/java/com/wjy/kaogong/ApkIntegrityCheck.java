package com.wjy.kaogong;

import java.io.File;
import java.io.IOException;

final class ApkIntegrityCheck {
    enum Status {
        MATCH,
        MISMATCH,
        ERROR
    }

    static final class Result {
        final Status status;
        final Exception error;

        Result(Status status, Exception error) {
            this.status = status;
            this.error = error;
        }
    }

    interface Verifier {
        boolean verify(File file, String expectedSha256) throws IOException;
    }

    private ApkIntegrityCheck() {}

    static Result run(File file, String expectedSha256, Runnable discard) {
        return run(file, expectedSha256, discard, ApkIntegrityVerifier::verifyAndDeleteOnMismatch);
    }

    static Result run(File file, String expectedSha256, Runnable discard, Verifier verifier) {
        Status status;
        Exception error = null;
        try {
            status = verifier.verify(file, expectedSha256) ? Status.MATCH : Status.MISMATCH;
        } catch (IOException | RuntimeException ex) {
            status = Status.ERROR;
            error = ex;
        }

        if (status != Status.MATCH) {
            try {
                discard.run();
            } catch (RuntimeException cleanupError) {
                if (error != null) error.addSuppressed(cleanupError);
                else error = cleanupError;
                status = Status.ERROR;
            }
        }
        return new Result(status, error);
    }
}
