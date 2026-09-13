import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMember, MEMBER_COOKIE } from "./members";
// Pages recheck access, because shared layouts can remain mounted during navigation.
export async function memberPage() {
  const member = await getMember((await cookies()).get(MEMBER_COOKIE)?.value);
  if (!member) redirect("/members/login");
  return member;
}
