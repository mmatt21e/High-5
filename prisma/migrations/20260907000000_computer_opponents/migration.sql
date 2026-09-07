-- Existing accounts remain human. Built-in opponents are provisioned on demand.
ALTER TABLE "User" ADD COLUMN "computerLevel" TEXT;
CREATE UNIQUE INDEX "User_computerLevel_key" ON "User"("computerLevel");
