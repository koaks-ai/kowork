import { z } from 'zod'
import { epochMillisSchema, idSchema } from '../primitives'

/**
 * 项目。
 *
 * `rootPath` 始终是 **agent server 侧** 的绝对路径。这是 KAP 与旧协议最重要的语义差异之一：
 * 远程模式下工作目录在服务器上，客户端不得假定该路径在本机存在，也不得用本机的路径分隔符
 * 去解析它。需要让用户挑选目录时走 `fs.browse`，不要用客户端的原生文件对话框。
 */
export const projectSchema = z.object({
  id: idSchema,
  name: z.string(),
  rootPath: z.string(),
  createdAt: epochMillisSchema,
  updatedAt: epochMillisSchema,
  deletedAt: epochMillisSchema.nullable()
})
export type ProjectDto = z.infer<typeof projectSchema>
