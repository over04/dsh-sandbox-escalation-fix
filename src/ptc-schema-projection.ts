import { symbols } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { RUN_CODE_NAME } from '@deepseek-ai/dsh-tools'
import { escalationPolicyFor } from './policy.ts'
import { projectEscalationParameters } from './schema-projection.ts'

type SystemPrompt = Context['systemPrompt']
type TracedSystemPrompt = SystemPrompt & { [symbols.original]?: TracedSystemPrompt }

const PROGRAM_ESCALATION = ' A sandbox escalation approves this complete program for one execution only.'
const REQUEST_WIDER = ' Request wider access only after evidence of a denial.'

export function installPtcSchemaProjection(ctx: Context): () => void {
  // Cordis 按调用方代理服务；只包装当前宿主的服务实例。
  let prompt = ctx.systemPrompt as TracedSystemPrompt
  for (let target = prompt[symbols.original]; target !== undefined; target = prompt[symbols.original]) {
    prompt = target
  }

  // DSH 在组装完成后才交付工具声明，且随后会把同一份声明写入请求记录。
  const previous = Object.getOwnPropertyDescriptor(prompt, 'assemble')
  const original = prompt.assemble
  let active = true

  async function assemble(this: SystemPrompt, ...args: Parameters<SystemPrompt['assemble']>) {
    const assembly = await Reflect.apply(original, this, args)
    const [context] = args
    if (!active || context === undefined) return assembly

    const index = assembly.tools.findIndex(tool => tool.name === RUN_CODE_NAME)
    const tool = assembly.tools[index]
    if (tool === undefined) return assembly
    const properties = tool.parameters.properties
    if (typeof properties !== 'object' || properties === null
      || (!Object.hasOwn(properties, 'sandbox_permissions') && !Object.hasOwn(properties, 'justification'))) return assembly

    // scope 也可以单独用于预览，但只有真实 Agent 有会话权限可供投影。
    const scope = context.scope as Partial<Agent> | undefined
    const agent = context.agent ?? (scope?.id !== undefined && ctx.agents.get(scope.id) === scope ? scope as Agent : undefined)
    if (agent === undefined) return assembly

    const { viableTargets } = escalationPolicyFor(ctx, agent)
    const description = viableTargets.length > 0 ? tool.description
      : tool.description.replace(PROGRAM_ESCALATION, '').replace(REQUEST_WIDER, '')
    const projected = {
      ...tool,
      description,
      parameters: projectEscalationParameters(tool.parameters, viableTargets),
    }
    return { ...assembly, tools: assembly.tools.with(index, projected) }
  }

  Object.defineProperty(prompt, 'assemble', {
    configurable: true,
    enumerable: previous?.enumerable ?? false,
    writable: true,
    value: assemble,
  })
  return () => {
    active = false
    if (Object.getOwnPropertyDescriptor(prompt, 'assemble')?.value !== assemble) return
    if (previous === undefined) Reflect.deleteProperty(prompt, 'assemble')
    else Object.defineProperty(prompt, 'assemble', previous)
  }
}
