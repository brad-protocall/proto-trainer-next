-- CreateTable
CREATE TABLE "document_reviews" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "transcript_accuracy" INTEGER NOT NULL,
    "guidelines_compliance" INTEGER NOT NULL,
    "overall_score" INTEGER NOT NULL,
    "specific_gaps" JSONB NOT NULL,
    "review_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_reviews_session_id_key" ON "document_reviews"("session_id");

-- AddForeignKey
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
