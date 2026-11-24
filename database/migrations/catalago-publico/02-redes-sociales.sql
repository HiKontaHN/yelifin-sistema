CREATE TABLE IF NOT EXISTS organization_social_links (
  org_id   BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'whatsapp')),
  url      TEXT NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2048),
  PRIMARY KEY (org_id, platform)
);
