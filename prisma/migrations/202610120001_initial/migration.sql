CREATE TABLE "User" (
  "id" UUID PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Session" (
  "tokenHash" TEXT PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE TABLE "World" (
  "id" UUID PRIMARY KEY, "ownerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL, "seed" INTEGER NOT NULL, "generatorVersion" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 0, "blockCount" INTEGER NOT NULL DEFAULT 0,
  "playerState" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "World_ownerId_updatedAt_idx" ON "World"("ownerId", "updatedAt");
CREATE TABLE "WorldChunk" (
  "worldId" UUID NOT NULL REFERENCES "World"("id") ON DELETE CASCADE,
  "x" INTEGER NOT NULL, "z" INTEGER NOT NULL, "edits" JSONB NOT NULL,
  PRIMARY KEY ("worldId", "x", "z")
);
