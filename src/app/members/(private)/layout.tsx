import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMember, MEMBER_COOKIE } from "@/server/members";
export default async function PrivateMemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await getMember((await cookies()).get(MEMBER_COOKIE)?.value)))
    redirect("/members/login");
  return children;
}
