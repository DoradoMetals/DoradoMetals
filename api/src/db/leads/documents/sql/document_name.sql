-- A lead document's canonical name from its pdf kind; the one place the words
-- live. `$kind` is replaced with the caller's column.
CASE $kind
  WHEN 'rate_sheet' THEN 'Rates Sheet'
  WHEN 'assay_results' THEN 'Assay Results'
  ELSE initcap(replace($kind::text, '_', ' '))
END
