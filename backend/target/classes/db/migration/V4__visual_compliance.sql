CREATE TABLE visual_compliance (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(30) NOT NULL,
    color_score INTEGER NOT NULL DEFAULT 100,
    logo_status VARCHAR(30) NOT NULL DEFAULT 'VERIFIED',
    overall_visual_score INTEGER NOT NULL DEFAULT 100,
    details_json TEXT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_visual_submission FOREIGN KEY (submission_id) REFERENCES submission(id) ON DELETE CASCADE
);

CREATE INDEX idx_visual_submission ON visual_compliance(submission_id);

