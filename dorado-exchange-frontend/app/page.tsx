'use client';

import { useEffect } from "react";
import { authClient } from "@/lib/authClient";

export default function Home() {

  const getSession = async () => {
    return await authClient.getSession()
    // console.log(data)

  }

  return (
    <div className="flex flex-col items-center">
      {/* <h1 className="text-2xl font-bold">WELCOME TO DORADO METALS EXCHANGE</h1>

      {isLoading && <p>Loading user session...</p>}

      {!isLoading && user ? (
        <p className="mt-4 text-lg">Hello, {user.name}!</p>
      ) : (
        <p className="mt-4 text-lg">Please log in to continue.</p>
      )} */}
    </div>
  );
}
