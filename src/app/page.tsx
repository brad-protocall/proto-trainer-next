"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { UserRole } from "@/types";

export default function HomePage() {
  const router = useRouter();

  const handleRoleSelect = (role: UserRole) => {
    router.push(`/${role}`);
  };

  return (
    <main className="min-h-screen bg-brand-navy flex flex-col items-center justify-center p-8">
      <Image
        src="/protocall-logo.svg"
        alt="Protocall"
        width={200}
        height={53}
        className="mb-8"
        priority
      />
      <h1 className="text-3xl font-marfa font-bold text-white mb-8 text-center">
        Proto Training Guide
      </h1>
      <p className="text-gray-400 mb-8 text-center font-marfa">
        Select your role to continue
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={() => handleRoleSelect("supervisor")}
          className="bg-brand-orange hover:bg-brand-orange-hover text-white
                     font-marfa font-bold py-4 px-8 rounded-lg text-lg"
        >
          Supervisor
        </button>
        <button
          onClick={() => handleRoleSelect("learner")}
          className="bg-blue-500 hover:bg-blue-600 text-white
                     font-marfa font-bold py-4 px-8 rounded-lg text-lg"
        >
          Learner
        </button>
      </div>
    </main>
  );
}
