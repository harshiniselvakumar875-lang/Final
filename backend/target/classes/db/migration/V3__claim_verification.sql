CREATE TABLE claim_verification (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    claim_text VARCHAR(1000) NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('VERIFIED', 'CONTRADICTED', 'UNVERIFIED')),
    confidence INTEGER NOT NULL DEFAULT 85,
    source_id VARCHAR(60),
    evidence_text TEXT,
    explanation TEXT NOT NULL,
    suggested_fix VARCHAR(1000),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_claim_submission FOREIGN KEY (submission_id) REFERENCES submission(id) ON DELETE CASCADE
);

CREATE INDEX idx_claim_submission ON claim_verification(submission_id, status);

