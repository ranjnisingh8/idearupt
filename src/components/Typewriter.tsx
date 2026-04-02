import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface TypewriterProps {
  text: string;
  className?: string;
  speed?: number;
}

const Typewriter = ({ text, className = "", speed = 60 }: TypewriterProps) => {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span className={className}>
      {displayed}
      {!done && (
        <span
          className="inline-block w-0.5 h-[1em] bg-accent ml-0.5 align-middle"
          style={{ animation: "typewriter-cursor 0.8s step-end infinite" }}
        />
      )}
    </span>
  );
};

export default Typewriter;
