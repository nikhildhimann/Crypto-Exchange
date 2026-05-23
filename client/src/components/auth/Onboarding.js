import { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { ShieldCheck, Zap, Globe } from "lucide-react";
import { useAppContext } from "../../contexts/AppContext";

const SLIDES = [
  {
    title: "Your Keys, Your Crypto",
    description: "Take full control of your assets with non-custodial security.",
    icon: ShieldCheck,
    color: "text-indigo-400",
    bg: "bg-indigo-500/20",
    border: "border-indigo-500/30",
    shadow: "shadow-indigo-500/20",
  },
  {
    title: "Lightning Fast Swaps",
    description: "Exchange tokens instantly with minimal fees across networks.",
    icon: Zap,
    color: "text-amber-400",
    bg: "bg-amber-500/20",
    border: "border-amber-500/30",
    shadow: "shadow-amber-500/20",
  },
  {
    title: "Explore the Web3",
    description: "Connect to dApps, buy NFTs, and unlock the decentralized web.",
    icon: Globe,
    color: "text-emerald-400",
    bg: "bg-emerald-500/20",
    border: "border-emerald-500/30",
    shadow: "shadow-emerald-500/20",
  },
];

export function Onboarding() {
  const navigate = useNavigate();
  const { appAccessState, wallets } = useAppContext();
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleFinish = () => {
    // if (typeof window !== "undefined") {
    //   window.localStorage.setItem("aura_onboarding_completed", "true");
    // }

    if (appAccessState === "locked") {
      navigate("/unlock", { replace: true });
      return;
    }

    if (appAccessState === "pin_setup_required") {
      navigate("/unlock/setup-pin", { replace: true });
      return;
    }

    if (wallets?.length > 0) {
      navigate("/app/home", { replace: true });
      return;
    }

    navigate("/auth/login", { replace: true });
  };

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    handleFinish();
  };

  return (
    <div className="aura-container">
      <div className="flex justify-end p-6 z-20">
        <button
          onClick={handleSkip}
          className="text-slate-400 font-semibold text-sm hover:text-white transition-colors"
        >
          Skip
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center text-center w-full max-w-sm"
          >
            <div
              className={`w-32 h-32 rounded-full ${SLIDES[currentSlide].bg} ${SLIDES[currentSlide].border} border-2 flex items-center justify-center mb-10 shadow-2xl ${SLIDES[currentSlide].shadow}`}
            >
              {(() => {
                const Icon = SLIDES[currentSlide].icon;
                return (
                  <Icon
                    size={64}
                    className={SLIDES[currentSlide].color}
                    strokeWidth={1.5}
                  />
                );
              })()}
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight mb-4">
              {SLIDES[currentSlide].title}
            </h2>
            <p className="text-slate-400 text-lg">
              {SLIDES[currentSlide].description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="p-8 pb-12 z-20 flex flex-col items-center space-y-8">
        <div className="flex space-x-2">
          {SLIDES.map((_, index) => (
            <div
              key={index}
              className={`h-2 rounded-full transition-all duration-300 ${index === currentSlide ? "w-8 bg-indigo-500" : "w-2 bg-slate-800"
                }`}
            />
          ))}
        </div>

        <div className="w-full space-y-4">
          <button
            onClick={handleNext}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98]"
          >
            {currentSlide === SLIDES.length - 1 ? "Get Started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}