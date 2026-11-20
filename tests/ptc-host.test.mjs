import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const installDir = process.env.DSH_INSTALL_DIR
assert.ok(installDir && isAbsolute(installDir), 'Set DSH_INSTALL_DIR to the absolute directory of a DSH npm installation')
const hostManifest = pathToFileURL(join(installDir, 'package.json')).href
const pluginUrl = new URL('../lib/index.mjs', import.meta.url).href

function loadHostPackage(name) {
  return import(`@deepseek-ai/${name}`)
}

function runCodeSchema(assembly) {
  const schema = assembly.tools.find(tool => tool.name === 'run_code')
  assert.ok(schema, 'The PTC executor must expose run_code')
  return schema
}

function assertTargets(schema, targets) {
  const { properties } = schema.parameters
  assert.equal(properties.code.type, 'string')
  assert.equal(properties.description.type, 'string')
  assert.equal(properties.timeoutMs.type, 'number')
  assert.deepEqual(properties.sandbox_permissions?.enum, targets)
  assert.equal(Object.hasOwn(properties, 'justification'), targets !== undefined)
  assert.equal(schema.description.includes('Request wider access only after evidence of a denial.'), targets !== undefined)
  assert.match(schema.description, /Programs are never replayed automatically\./)
}

await test('real PTC host projects run_code per session and keeps DSH approval in charge', async (t) => {
  // 让测试和构建产物使用实际宿主依赖，独立于旧版开发测试依赖。
  const hostImports = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@deepseek-ai/') && (context.parentURL === import.meta.url || context.parentURL === pluginUrl)) {
        return nextResolve(specifier, { ...context, parentURL: hostManifest })
      }
      return nextResolve(specifier, context)
    },
  })
  t.after(() => hostImports.deregister())
  const { Context } = await loadHostPackage('cordis')
  const { default: plugin } = await import(pluginUrl)
  const { default: SessionStore, SessionId } = await loadHostPackage('dsh-session')
  const { setSandboxMode } = await loadHostPackage('dsh-sandbox-policy')
  const { setApprovalPolicy } = await loadHostPackage('dsh-user-approval')
  const { assembleContextFor } = await loadHostPackage('dsh-agent')
  const nativeExecutor = await loadHostPackage('dsh-tool-executor-native')
  const ptcExecutor = await loadHostPackage('dsh-tool-executor-ptc')
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  for (const name of [
    'dsh-session-projection', 'dsh-system-prompt', 'dsh-llm', 'dsh-agent', 'dsh-tools',
    'dsh-fs-local', 'dsh-subprocess-local', 'dsh-sandbox-local', 'dsh-sandbox-policy',
    'dsh-user-approval', 'dsh-working-directory',
  ]) {
    await ctx.plugin((await loadHostPackage(name)).default)
  }
  await ctx.plugin((await loadHostPackage('dsh-ptc-runtime-node')).default, { timeoutMs: 5_000 })
  await ctx.plugin(nativeExecutor)
  await ctx.plugin((await loadHostPackage('dsh-agent-loop')).default)
  const pluginFiber = await ctx.plugin(plugin, { logLevel: 'silent' })

  const agent = await ctx.agentLoop.create(SessionId('ptc-schema-test'))
  await agent.ctx.plugin(ptcExecutor)
  const schema = async () => runCodeSchema(await ctx.systemPrompt.assemble(assembleContextFor(agent)))
  const run = async (id, parameters) => {
    const { results: [settled] } = await ctx.tools.execute({
      agent,
      signal: AbortSignal.timeout(8_000),
      calls: [{ type: 'tool-call', id, name: 'run_code', arguments: JSON.stringify(parameters) }],
    })
    assert.ok(settled)
    return settled.result
  }

  setSandboxMode(agent.session, 'danger-full-access')
  setApprovalPolicy(agent.session, 'ask')
  assertTargets(await schema(), undefined)
  const ordinary = await run('ordinary-ptc', { code: 'return 21 * 2', description: 'Calculate a numeric result' })
  assert.equal(ordinary.isError, false, ordinary.error?.message)
  assert.equal(ordinary.value.result, 42)

  setSandboxMode(agent.session, 'read-only')
  assertTargets(await schema(), ['workspace-write', 'danger-full-access'])
  setSandboxMode(agent.session, 'workspace-write')
  assertTargets(await schema(), ['danger-full-access'])
  agent.session.append('turn/start', { turn: 1 })
  const wider = await run('wider-ptc', {
    code: 'return 42',
    description: 'Check program approval handling',
    sandbox_permissions: 'danger-full-access',
    justification: 'Exercise the real approval service without an answerer.',
  })
  assert.equal(wider.isError, true)
  assert.equal(wider.error.info.code, 'SANDBOX_ESCALATION_UNAVAILABLE')
  const approvals = agent.session.snapshotEvents().filter(event => event.type === 'approval/asked' || event.type === 'approval/decided')
  assert.equal(approvals[0]?.data.toolName, 'run_code')
  assert.equal(approvals[0]?.data.callId, 'wider-ptc')
  assert.equal(approvals[1]?.data.outcome, 'unavailable')

  setApprovalPolicy(agent.session, 'never')
  assertTargets(runCodeSchema(await ctx.systemPrompt.assemble({ scope: agent })), undefined)
  assert.equal((await ctx.systemPrompt.assemble()).tools.some(tool => tool.name === 'run_code'), false)
  await pluginFiber.dispose()
  assertTargets(await schema(), ['workspace-write', 'danger-full-access'])
})
