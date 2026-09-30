-- CreateEnum
CREATE TYPE "AttendanceDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "AttendanceSettings" (
    "orgId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "startTime" TEXT NOT NULL DEFAULT '09:30',
    "endTime" TEXT NOT NULL DEFAULT '18:00',
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "expectedMinutes" INTEGER NOT NULL DEFAULT 480,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSettings_pkey" PRIMARY KEY ("orgId")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "policy" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceBreak" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),

    CONSTRAINT "AttendanceBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrectionRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "proposed" JSONB NOT NULL,
    "baseVersion" INTEGER,
    "reason" VARCHAR(1000) NOT NULL,
    "status" "AttendanceDecision" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" VARCHAR(1000),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceRecord_orgId_workDate_idx" ON "AttendanceRecord"("orgId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_orgId_userId_workDate_key" ON "AttendanceRecord"("orgId", "userId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_orgId_id_key" ON "AttendanceRecord"("orgId", "id");

-- CreateIndex
CREATE INDEX "AttendanceBreak_orgId_recordId_start_idx" ON "AttendanceBreak"("orgId", "recordId", "start");

-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_orgId_status_createdAt_idx" ON "AttendanceCorrectionRequest"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_orgId_userId_workDate_idx" ON "AttendanceCorrectionRequest"("orgId", "userId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "users_orgId_id_key" ON "users"("orgId", "id");

-- AddForeignKey
ALTER TABLE "AttendanceSettings" ADD CONSTRAINT "AttendanceSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_orgId_userId_fkey" FOREIGN KEY ("orgId", "userId") REFERENCES "users"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_orgId_recordId_fkey" FOREIGN KEY ("orgId", "recordId") REFERENCES "AttendanceRecord"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_orgId_userId_fkey" FOREIGN KEY ("orgId", "userId") REFERENCES "users"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_orgId_reviewedBy_fkey" FOREIGN KEY ("orgId", "reviewedBy") REFERENCES "users"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Database backstops to the organisation write lock used by the API.
CREATE UNIQUE INDEX "AttendanceRecord_one_open_per_user" ON "AttendanceRecord" ("orgId", "userId") WHERE "checkOut" IS NULL;
CREATE UNIQUE INDEX "AttendanceBreak_one_open_per_record" ON "AttendanceBreak" ("orgId", "recordId") WHERE "end" IS NULL;
CREATE UNIQUE INDEX "AttendanceCorrectionRequest_one_pending" ON "AttendanceCorrectionRequest" ("orgId", "userId", "workDate") WHERE "status" = 'PENDING';
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "attendance_order" CHECK ("checkOut" IS NULL OR "checkOut" >= "checkIn");
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "break_order" CHECK ("end" IS NULL OR "end" >= "start");
