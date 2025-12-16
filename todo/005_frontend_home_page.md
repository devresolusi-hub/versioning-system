# 005 – Frontend Home Page Implementation

## Tasks
- [ ] Create home page route
  - [ ] Create `src/routes/+page.svelte` (main page)
  - [ ] Create `src/routes/+page.server.ts` (server load function)
- [ ] Implement server-side data fetching
  - [ ] Query Supabase database using anon key (public access)
  - [ ] Use SQL query from SDD to fetch aggregated data:
    ```sql
    SELECT 
        fm.id,
        fm.file_name,
        fm.created_at,
        json_agg(
            json_build_object(
                'id', v.id,
                'version', v.version,
                'file_size', v.file_size,
                'file_type', v.file_type,
                'uploaded_at', v.uploaded_at,
                'storage_path', v.storage_path,
                'is_latest', v.is_latest
            ) ORDER BY v.uploaded_at DESC
        ) as versions
    FROM file_metadata fm
    LEFT JOIN versions v ON fm.id = v.file_metadata_id
    GROUP BY fm.id
    ORDER BY fm.updated_at DESC;
    ```
  - [ ] Handle empty state (no files)
  - [ ] Handle errors gracefully
- [ ] Implement UI layout
  - [ ] Create responsive container/layout
  - [ ] Add page title/header
  - [ ] Style with modern, clean design
- [ ] Display file list
  - [ ] Group by file_name
  - [ ] Show file metadata: name, created_at, updated_at
  - [ ] Display versions for each file
- [ ] Display version information
  - [ ] Show version number
  - [ ] Show file size (formatted: KB, MB, GB)
  - [ ] Show file type/MIME type
  - [ ] Show uploaded_at timestamp (formatted)
  - [ ] Show "Latest" badge for `is_latest = TRUE` versions
  - [ ] Sort versions by uploaded_at DESC (newest first)
- [ ] Implement download functionality
  - [ ] Generate download links from `storage_path`
  - [ ] Format URL: `https://{project}.supabase.co/storage/v1/object/public/{storage_path}`
  - [ ] Add download button/link for each version
  - [ ] Test download links work correctly
- [ ] Add styling
  - [ ] Responsive design (mobile, tablet, desktop)
  - [ ] Clean, modern UI
  - [ ] Proper spacing and typography
  - [ ] Visual distinction for latest version
  - [ ] Hover states for interactive elements
- [ ] Handle edge cases
  - [ ] Files with no versions
  - [ ] Empty state message
  - [ ] Loading state
  - [ ] Error state with user-friendly message

## Testing Checklist
- [ ] Page loads and displays files correctly
- [ ] Versions sorted correctly (newest first)
- [ ] Latest badge appears on correct version
- [ ] Download links work and download files
- [ ] Responsive design works on different screen sizes
- [ ] Empty state displays when no files exist
- [ ] Error handling works if database query fails

## Expected Outcome
- Home page displays all files and versions
- Download links functional
- Clean, responsive UI
- Proper handling of all states (loading, empty, error)

