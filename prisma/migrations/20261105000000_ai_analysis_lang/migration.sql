-- Language-aware AI analysis cache: the same verified dataset may be analyzed
-- in English or Arabic; each language gets its own cached generation so users
-- always read an analysis written in their UI language.
ALTER TABLE "AiAnalysis" ADD COLUMN "lang" TEXT NOT NULL DEFAULT 'en';
