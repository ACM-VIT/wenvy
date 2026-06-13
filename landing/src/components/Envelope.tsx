import { motion } from 'framer-motion'

const ring = (delay: number) => ({
  initial: { opacity: 0, scale: 0.85 },
  whileInView: { opacity: 1, scale: 1 },
  viewport: { once: true, amount: 0.5 },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const, delay },
})

/** Three-layer encryption envelope: ssh key → team key → repo key → snapshot. */
export function Envelope() {
  return (
    <figure className="envelope" aria-label="Three-layer encryption envelope diagram">
      <svg viewBox="0 0 360 360" role="img">
        <motion.g className="env-ring" {...ring(0)}>
          <rect x="14" y="14" width="332" height="332" rx="20" />
          <text x="30" y="40">ssh key · X25519</text>
        </motion.g>
        <motion.g className="env-ring" {...ring(0.12)}>
          <rect x="56" y="56" width="248" height="248" rx="16" />
          <text x="72" y="82">team key</text>
        </motion.g>
        <motion.g className="env-ring" {...ring(0.24)}>
          <rect x="98" y="98" width="164" height="164" rx="12" />
          <text x="114" y="124">repo key</text>
        </motion.g>
        <motion.g className="env-core" {...ring(0.36)}>
          <rect x="138" y="150" width="84" height="60" rx="8" />
          <text x="180" y="184" textAnchor="middle">snapshot</text>
        </motion.g>
        <text className="env-foot" x="180" y="338" textAnchor="middle">server sees only the outer ciphertext</text>
      </svg>
    </figure>
  )
}
