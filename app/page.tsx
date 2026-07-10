import { redirect } from "next/navigation";
import { primaryCustomer } from "@/lib/customers";

// The platform root sends you straight into the primary customer's pulse; the
// sidebar lists every customer so you can switch from there.
export default function RootPage() {
  redirect(`/c/${primaryCustomer().id}`);
}
