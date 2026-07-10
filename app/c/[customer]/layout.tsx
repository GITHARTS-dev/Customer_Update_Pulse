import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/customers";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ customer: string }>;
}

/**
 * Per-customer shell. Validates the customer and sets its accent as the
 * --accent CSS variable (RGB channels) so every coral/violet utility beneath
 * re-themes to this customer. `display: contents` means the wrapper sets the
 * variable without adding a layout box. The HARTS rainbow + elephant sentiment
 * palette stay global — only the accent + logo differ per customer.
 */
export default async function CustomerLayout({ children, params }: LayoutProps) {
  const { customer: cid } = await params;
  const customer = getCustomer(cid);
  if (!customer) notFound();

  return (
    <div
      style={
        { display: "contents", "--accent": customer.theme.accent } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
