import Image from "next/image";
import { Suspense } from "react";
import { SignInButton } from "@/components/SignInButton";

/**
 * Static on purpose. It reads no server-side data (the callbackUrl is read
 * client-side in SignInButton), so Azure SWA serves it as a plain static file
 * and never routes it through the auth middleware — which is what caused the
 * /sign-in redirect loop when this page was server-rendered.
 */
export default function SignInPage() {
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

        <Suspense
          fallback={
            <div className="w-full rounded-lg bg-violet/60 text-white py-2.5 text-sm font-medium">
              Sign in with Microsoft
            </div>
          }
        >
          <SignInButton />
        </Suspense>
      </div>
    </div>
  );
}
