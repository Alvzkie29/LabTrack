
import { useNavigate } from "react-router-dom";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  LoaderCircle,
  Monitor,
  Network,
  CalendarCheck2,
  FileBarChart2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/api/client";
import { snackbar } from "@/utils/snackbar";

const MAROON = "#800000";
const GOLD = "#F4C430";

export function StaffLoginPage() {
  const navigate = useNavigate();
  const { login, logout } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const user = await login({
        identifier: identifier.trim(),
        password,
      });

      if (user.role === "Student" || user.role === "Faculty") {
        logout();
        snackbar.error(
          "This portal is for authorized staff only. Students sign in through the laboratory PC Agent, while Faculty confirm sessions using their PIN."
        );
        return;
      }

      navigate("/dashboard", { replace: true });
    } catch (err) {
      snackbar.error(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#ebeae6] px-4 py-6 text-[#252326] sm:px-6 lg:px-10">

      {/* Decorative background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-[#800000]/[0.035] blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-32 h-[500px] w-[500px] rounded-full bg-[#F4C430]/[0.07] blur-[100px]"
      />

      {/* Main login container */}
      <div className="relative z-10 grid w-full max-w-[1140px] overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(54,38,35,0.09)] md:min-h-[650px] md:grid-cols-[1.04fr_1fr]">

        {/* ====================================
            LEFT — BRANDING PANEL
        ==================================== */}
<section className="relative hidden min-h-[650px] flex-col overflow-hidden bg-[#F6F3EC] p-9 text-[#252326] md:flex lg:p-12">

  {/* Welcome Text */}
  <div className="relative z-10 mt-1 flex flex-col items-start gap-1">

    <h2 className="mt-2 max-w-[420px] text-[36px] font-semibold leading-[1.15] tracking-[-1.4px] text-[#242124] lg:text-[42px]">
      One workspace.
      <br />
      <span className="text-[#800000]">
        Every laboratory.
      </span>
    </h2>

    <p className="mt-5 max-w-[370px] text-[13px] leading-[1.8] text-[#82756F]">
      A smarter way to manage laboratory schedules,
      verified attendance, and academic compliance.
    </p>
  </div>

  {/* Oversized illustration sits behind the welcome text. */}
  <div className="pointer-events-none absolute inset-x-0 bottom-[64px] z-0 flex items-end justify-center">
    <img
      src="/img/labtrack.png"
      alt="Illustration of a staff member managing laboratory information"
      className="h-auto w-[110%] max-w-none shrink-0 object-contain"
      loading="eager"
    />
  </div>

  {/* Bottom Branding */}
  <div className="relative z-10 mt-auto pt-5">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-[#877B74]">
        Copyright © 2026 LabTrack. All rights reserved.
      </span>
    </div>
  </div>
</section>


        {/* ====================================
            RIGHT — LOGIN FORM
        ==================================== */}
        <section className="relative flex min-h-[600px] flex-col bg-[#fffefd] px-6 py-8 sm:px-10 md:px-9 lg:px-14 lg:py-11">

          {/* Top section */}
          <div className="flex items-center justify-between gap-3">

            {/* Mobile branding */}
         
          </div>

          {/* Form container */}
          <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-12">

            {/* Heading */}
            <h1 className="text-[20px] font-semibold tracking-[-1.1px] text-[#231f20] sm:text-[25px] self-center">
              Welcome back
              <span className="text-[#800000] text-4xl">.</span>
            </h1>

            <p className="mt-2 max-w-[330px] text-[13px] leading-[1.8] text-[#857b78] self-center text-center">
              Sign in with your staff credentials to access the
              laboratory management workspace.
            </p>

            {/* Form */}
            <form
              className="mt-12 space-y-5"
              onSubmit={handleSubmit}
            >
              {/* Identifier */}
              <div className="space-y-2">
<div className="relative">
                  <Mail
                    size={17}
                    strokeWidth={1.7}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#ac9e98]"
                  />

                  <Input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                    }}
                    placeholder=" "
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={isSubmitting}
                    className="peer h-10 rounded-xl border-[#e6dfda] bg-[#faf9f7] py-2 pl-11 pr-4 text-[13px] text-[#332c2c] placeholder:text-[#afa5a0] focus-visible:border-[#800000] focus-visible:ring-[#800000]/15"
                  />
                  <Label
                    htmlFor="identifier"
                    className="absolute left-10 top-0 -translate-y-1/2 cursor-text bg-[#faf9f7] px-1 text-[10px] font-medium leading-4 text-[#857b78] transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-[13px] peer-focus:top-0 peer-focus:text-[10px] peer-focus:text-[#800000] peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
                  >
                    School ID or Email
                  </Label>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
<div className="relative">
                  <LockKeyhole
                    size={17}
                    strokeWidth={1.7}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#ac9e98]"
                  />

                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                    }}
                    placeholder=" "
                    autoComplete="current-password"
                    required
                    disabled={isSubmitting}
                    className="peer h-10 rounded-xl border-[#e6dfda] bg-[#faf9f7] py-2 pl-11 pr-12 text-[13px] text-[#332c2c] placeholder:text-[#afa5a0] focus-visible:border-[#800000] focus-visible:ring-[#800000]/15"
                  />
                  <Label
                    htmlFor="password"
                    className="absolute left-10 top-0 -translate-y-1/2 cursor-text bg-[#faf9f7] px-1 text-[10px] font-medium leading-4 text-[#857b78] transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-[13px] peer-focus:top-0 peer-focus:text-[10px] peer-focus:text-[#800000] peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
                  >
                    Password
                  </Label>

                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#aa9b95] transition-colors hover:bg-[#f0ebe7] hover:text-[#800000] focus-visible:outline-2 focus-visible:outline-[#800000]"
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </div>

              {/* Login error */}

              {/* Sign in button */}
              <Button
                type="submit"
                disabled={isSubmitting}
                className="group mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-[#800000] text-[13px] font-semibold text-white shadow-[0_5px_14px_rgba(128,0,0,0.13)] transition-all hover:bg-[#680000] hover:shadow-[0_7px_18px_rgba(128,0,0,0.19)] disabled:opacity-65"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle
                      size={17}
                      className="animate-spin"
                    />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                  </>
                )}
              </Button>
            </form>

            {/* Bottom information */}
            <div className="mt-9 border-t border-[#eee8e4] pt-6">
              <div className="flex items-start gap-2.5">
                <ShieldCheck
                  size={16}
                  className="mt-0.5 shrink-0 text-[#9e8983]"
                  strokeWidth={1.6}
                />
                <p className="text-[11px] leading-[1.8] text-[#958883]">
                  For Administrators, Laboratory Custodians,
                  and Laboratory Assistants. Faculty use PIN
                  confirmation, while students sign in through
                  the laboratory PC Agent.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
