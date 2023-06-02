import type { LoadEvent } from "@sveltejs/kit"
import { chansClient, friendsClient } from "$lib/clients"

export const load = async ({ depends }: LoadEvent) => {
	const ret: any = {}
	{
		const { status, body } = await chansClient.getMyChans()
		if (status !== 200) {
			console.log(
				`Failed to load channel list. Server returned code ${status} with message \"${
					(body as any)?.message
				}\"`,
			)
		} else ret.discussions = body
		depends(":discussions")
	}

	{
		const { status, body } = await friendsClient.getFriends()
		if (status !== 200) {
			console.log(
				`Failed to load friend list. Server returned code ${status} with message \"${
					(body as any)?.message
				}\"`,
			)
		} else ret.friends = body
		depends(":friends")
	}
	return ret
}
