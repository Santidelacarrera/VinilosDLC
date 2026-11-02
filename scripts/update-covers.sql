-- Actualización de portadas oficiales de referencia (Cover Art Archive)
-- Ejecutar en: https://supabase.com/dashboard/project/ujswessaedegncxeoeio/sql

begin;

-- 1. Los Bunkers - MTV Unplugged
update public.albums
set cover = 'https://coverartarchive.org/release-group/18e89944-6de3-4ce7-a3e6-ed296c27e151/front-500',
    cover_rights = 'ARCHIVE_REFERENCE',
    cover_rights_note = 'Referencia visual oficial de Cover Art Archive / Internet Archive',
    updated_at = now()
where id = 16;

-- 2. Los Prisioneros - Corazones
update public.albums
set cover = 'https://coverartarchive.org/release-group/c50ba999-f67f-39da-ab4a-c77a618ddb37/front-500',
    cover_rights = 'ARCHIVE_REFERENCE',
    cover_rights_note = 'Referencia visual oficial de Cover Art Archive / Internet Archive',
    updated_at = now()
where id = 17;

-- 3. The Beatles - The Beatles at the Hollywood Bowl
update public.albums
set cover = 'https://coverartarchive.org/release-group/eabb68b3-d57c-359a-8215-91f38d365da5/front-500',
    cover_rights = 'ARCHIVE_REFERENCE',
    cover_rights_note = 'Referencia visual oficial de Cover Art Archive / Internet Archive',
    updated_at = now()
where id = 32;

-- 4. Barry White - Love's Theme
update public.albums
set cover = 'https://coverartarchive.org/release-group/bf2d4441-9c0f-428e-870c-ca8b663f175d/front-500',
    cover_rights = 'ARCHIVE_REFERENCE',
    cover_rights_note = 'Referencia visual oficial de Cover Art Archive / Internet Archive',
    updated_at = now()
where id = 49;

-- 5. Prince - Sign o' the Times
update public.albums
set cover = 'https://coverartarchive.org/release/36315239-4d2a-4f51-9dbf-8049daae1c17/front',
    cover_rights = 'ARCHIVE_REFERENCE',
    cover_rights_note = 'Referencia visual oficial de Cover Art Archive / Internet Archive',
    updated_at = now()
where id = 53;

-- 6. Madonna - Like a Prayer
update public.albums
set cover = 'https://coverartarchive.org/release-group/ea3a395f-5e10-3332-bba1-e0694a638212/front-500',
    cover_rights = 'ARCHIVE_REFERENCE',
    cover_rights_note = 'Referencia visual oficial de Cover Art Archive / Internet Archive',
    updated_at = now()
where id = 54;

-- 7. Bee Gees - The Greatest Hits
update public.albums
set cover = 'https://coverartarchive.org/release/dc00d779-9e59-436a-91d5-68a62b7a588d/front-500',
    cover_rights = 'ARCHIVE_REFERENCE',
    cover_rights_note = 'Referencia visual oficial de Cover Art Archive / Internet Archive',
    updated_at = now()
where id = 57;

commit;
