-- AlterTable: remove non-tbpro Upload.name column; filename belongs in Item.name
ALTER TABLE "Upload" DROP COLUMN IF EXISTS "name";
