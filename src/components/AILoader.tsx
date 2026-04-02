import { motion } from "framer-motion";

const AILoader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="relative w-16 h-16">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <motion.div
          key={i}
          className="absolute w-2.5 h-2.5 rounded-full"
          style={{
            background: i % 2 === 0 
              ? "hsl(263 70% 50%)" 
              : "hsl(187 94% 43%)",
            top: "50%",
            left: "50%",
            boxShadow: i % 2 === 0 
              ? "0 0 8px hsl(263 70% 50% / 0.6)" 
              : "0 0 8px hsl(187 94% 43% / 0.6)",
          }}
          animate={{
            x: [0, Math.cos((i * Math.PI * 2) / 6) * 22, 0],
            y: [0, Math.sin((i * Math.PI * 2) / 6) * 22, 0],
            scale: [0.8, 1.2, 0.8],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
      <motion.div
        className="absolute inset-0 rounded-full border border-accent/30"
        animate={{ rotate: 360, scale: [1, 1.1, 1] }}
        transition={{ rotate: { duration: 4, repeat: Infinity, ease: "linear" }, scale: { duration: 2, repeat: Infinity } }}
      />
    </div>
  </div>
);

export default AILoader;
