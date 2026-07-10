import Image from "next/image";
import { SignInButton } from "@/components/SignInButton";

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#F4F2FC] to-cream px-4">
      <div className="w-full max-w-sm rounded-card bg-cream border border-sand-200 shadow-hero p-8 flex flex-col items-center gap-5 text-center">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logos/harts_logo.png"
            alt="HARTS Consulting"
            width={278}
            height={98}
            className="h-6 w-auto"
            priority
          />
          <span className="h-4 w-px bg-sand-300" />
          <Image
            src="/logos/evora_logo.png"
            alt="Evora Group"
            width={307}
            height={45}
            className="h-4 w-auto"
            priority
          />
        </div>

        <div>
          <h1 className="font-serif text-xl text-ink-900">Lovely to have you here</h1>
          <p className="mt-1 text-sm text-ink-500">
            Sign in with your work account to open the Pulse dashboard.
          </p>
        </div>

        <SignInButton callbackUrl={callbackUrl || "/"} />
      </div>
    </div>
  );
}
