import type { LoadEvent } from "@sveltejs/kit"
import { chansClient, friendsClient } from "$lib/clients"
import type { Friendship } from "$types"

export const load = async ({ depends }: LoadEvent) => {
	depends(":discussions")
	const { status, body: discussions } = await chansClient.getMyChans()
	if (status !== 200) {
		console.log(
			`Failed to load channel list. Server returned code ${status} with message \"${
				(discussions as any)?.message
			}\"`,
		)
	}

	depends(":friends")
	const { status: status2, body: friendships} = await friendsClient.getFriends() as {status: number; body: Friendship[]}
	if (status >= 400) {
		console.log(
			`Failed to load friend list. Server returned code ${status2} with message \"${
				(friendships as any)?.message
			}\"`,
		)
	}

    const friendList = friendships.map((friendship: Friendship) => friendship.friendName)

	return { discussions, friendships, friendList }
}
