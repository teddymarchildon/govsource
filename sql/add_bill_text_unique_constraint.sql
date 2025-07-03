-- First, check for existing duplicates
-- This query will show you any duplicate bill_text records
SELECT 
    bill_id, 
    date, 
    type, 
    COUNT(*) as duplicate_count
FROM bill_text
WHERE date IS NOT NULL
GROUP BY bill_id, date, type
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Remove duplicates keeping only the most recent (highest id)
-- Uncomment and run this if you have duplicates
/*
DELETE FROM bill_text a
USING bill_text b
WHERE a.id < b.id 
    AND a.bill_id = b.bill_id 
    AND a.date = b.date 
    AND ((a.type = b.type) OR (a.type IS NULL AND b.type IS NULL));
*/

-- Create unique constraint on bill_id, date, and type
-- This will prevent future duplicates at the database level
ALTER TABLE bill_text
ADD CONSTRAINT bill_text_unique_bill_date_type 
UNIQUE NULLS NOT DISTINCT (bill_id, date, type);

-- Note: NULLS NOT DISTINCT means that NULL values are considered equal
-- for the purpose of the unique constraint. This prevents multiple
-- records with the same bill_id and date where type is NULL.

-- If your PostgreSQL version doesn't support NULLS NOT DISTINCT (< 15),
-- use this alternative that creates a unique index:
/*
CREATE UNIQUE INDEX bill_text_unique_bill_date_type_idx 
ON bill_text (bill_id, date, COALESCE(type, ''));
*/ 