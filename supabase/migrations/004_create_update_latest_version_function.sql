-- Migration: Create update_latest_version function and trigger
-- Description: Automatically marks the latest version and updates file_metadata timestamp

-- Function to automatically mark the latest version
CREATE OR REPLACE FUNCTION update_latest_version()
RETURNS TRIGGER AS $$
BEGIN
    -- Unmark all previous versions as latest
    UPDATE versions 
    SET is_latest = FALSE 
    WHERE file_metadata_id = NEW.file_metadata_id;
    
    -- Mark the new version as latest
    UPDATE versions 
    SET is_latest = TRUE 
    WHERE id = NEW.id;
    
    -- Update the file_metadata updated_at timestamp
    UPDATE file_metadata 
    SET updated_at = NOW() 
    WHERE id = NEW.file_metadata_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on insert
CREATE TRIGGER trigger_update_latest_version
AFTER INSERT ON versions
FOR EACH ROW
EXECUTE FUNCTION update_latest_version();

-- Comments for documentation
COMMENT ON FUNCTION update_latest_version() IS 'Automatically marks the latest version and updates file_metadata timestamp when a new version is inserted';

