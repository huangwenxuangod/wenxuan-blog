import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import path from 'node:path'

const cwd = process.cwd()
const outDir = path.join(cwd, '.bundle-analysis')
const summaryPath = path.join(outDir, 'summary.json')

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      }
    })
  })
}

async function safeStat(filePath) {
  try {
    return await stat(filePath)
  } catch {
    return null
  }
}

async function main() {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  await run('npx', ['opennextjs-cloudflare', 'build'])
  await run('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', outDir])

  const workerCandidates = [
    path.join(outDir, 'index.js'),
    path.join(outDir, 'worker.js'),
  ]

  let workerEntry = null
  let workerStat = null

  for (const candidate of workerCandidates) {
    const candidateStat = await safeStat(candidate)
    if (!candidateStat) continue
    workerEntry = candidate
    workerStat = candidateStat
    break
  }

  if (!workerEntry || !workerStat) {
    throw new Error(`Expected worker bundle at one of: ${workerCandidates.join(', ')}`)
  }

  const workerBuffer = await readFile(workerEntry)
  const gzipped = gzipSync(workerBuffer)

  const candidates = [
    path.join(cwd, '.open-next', 'worker.js'),
    path.join(cwd, '.open-next', 'server-functions', 'default', 'handler.mjs'),
  ]

  const extra = []
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue
    const fileStat = await safeStat(filePath)
    if (!fileStat) continue
    extra.push({
      path: path.relative(cwd, filePath),
      bytes: fileStat.size,
    })
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    dryRunBundle: {
      path: path.relative(cwd, workerEntry),
      rawBytes: workerStat.size,
      gzipBytes: gzipped.length,
    },
    references: extra,
  }

  await writeFile(summaryPath, JSON.stringify(summary, null, 2))
  console.log(`\nBundle summary written to ${summaryPath}\n`)
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
