import { z } from "zod"

export const zUserName = z
	.string()
	.nonempty()
	.min(3)
	.max(30)
	.refine((username) => username !== "@me", { message: "forbidden username" })
export const zUserPassword = z.string().nonempty().min(8).max(150)
