import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { AppService } from 'src/app.service';
import { EventType } from '@prisma/client';

enum EventTypeList
{
	NEW_DM = 'NEW_DM',
	DM_DELETED = "DM_DELETED",
	DM_NEW_EVENT = "DM_NEW_EVENT",
	DM_NEW_MESSAGE = "DM_NEW_MESSAGE",
}

@Injectable()
export class DmsService
{
	constructor(private readonly prisma: PrismaService,
			    private readonly appService: AppService) {}


	private directMessageSelect: Prisma.DirectMessageSelect =
	{
		id: true,
		requestedUserName: true,
		requestingUserName: true,
	}

	private discussionEventsSelect: Prisma.DiscussionEventSelect =
	{
		eventType: true,
		concernedUser: true,
	}

	private discussionMessagesSelect: Prisma.DiscussionMessageSelect =
	{
		content: true,
		relatedId: true,
	}

	private discussionElementsSelect: Prisma.DiscussionElementSelect =
	{
		id: true,
		event: { select: this.discussionEventsSelect },
		message: { select: this.discussionMessagesSelect },
		author: true,
		creationDate: true
	}


	async DmNewEvent(username: string, usernameToNotify: string, dmId: number, event: EventType) // event will change later from string to prisma schema enum type when it will work again
	{
		const { discussionElement: res } = await this.prisma.discussionEvent.create({
			data:
			{
				eventType: event,
				discussionElement:
				{
					create:
					{
						author: username,
						directMessageId: dmId,
					}
				}
			},
			select:
			{
				discussionElement: { select: this.discussionElementsSelect }
			}})
		return this.appService.pushEvent(usernameToNotify,
			{
				type: EventTypeList.DM_NEW_EVENT,
				data: { directMessageId: dmId, event: res }
			})
	}

	async getDms(username: string)
	{
		return this.prisma.directMessage.findMany({
			where:
			{
				OR:
				[
					{ requestedUserName: username },
					{ requestingUserName: username }
				]
			},
			select: this.directMessageSelect})
	}

	async createDm(username: string, friendUsername: string)
	{
		const toCheck = await this.prisma.user.findUnique({ where: { name: username },
			select:
			{
				friend:
				{
					where:
					{
						requestedUserName: friendUsername,
					},
					select: { id: true, directMessage: { select: { id: true } } },
					take: 1,
				},
				friendOf:
				{
					where:
					{
						requestingUserName: friendUsername,
					},
					select: { id: true, directMessage: { select: { id: true } } },
					take: 1,
				}
			}})
		if (!toCheck.friend.length && !toCheck.friendOf.length)
			throw new ForbiddenException(`${friendUsername} is not in your friendList !`)
		if (toCheck.friend[0]?.directMessage || toCheck.friendOf[0]?.directMessage)
			throw new ConflictException(`you already have a dm with ${friendUsername}`)
		const res = await this.prisma.directMessage.create({
			data:
			{
				friendShipId: toCheck.friend[0].id || toCheck.friend[0].id,
				requestingUserName: username,
				requestedUserName: friendUsername
			},
			select: this.directMessageSelect})
		await this.appService.pushEvent(friendUsername, { type: EventTypeList.NEW_DM, data: res })
		return res
	}

	async getDmMessages(username: string, id: number, nMessages: number, start?: number)
	{
		const res = await this.prisma.directMessage.findUnique({
			where:
			{
				id: id,
				OR:
				[
					{ requestingUserName: username },
					{ requestedUserName: username },
				],
			},
			select:
			{
				elements:
				{
					select: this.discussionElementsSelect,
					take: nMessages,
					orderBy: { id: 'desc' },
					cursor: (start !== undefined) ? { id: start } : undefined,
					skip: Number(start !== undefined) ? 1 : undefined,
				}
			}})
		if (!res)
			throw new NotFoundException(`directMessage with id ${id} not found`)
		return res.elements.reverse()
	}

	async createDmMessage(username: string, dmId: number, content: string, relatedId?: number)
	{
		const toCheck = await this.prisma.directMessage.findUnique({
			where:
			{
				id: dmId,
				OR:
				[
					{ requestedUserName: username },
					{ requestingUserName: username },
				],
			},
			select: (relatedId !== undefined) ?
			{
				elements:
				{
					where: { id: relatedId },
					select: { id: true },
					take: 1
				},
				requestingUserName: true,
				requestedUserName: true
			} : undefined})
		if (!toCheck)
			throw new NotFoundException(`directMessage with id ${dmId} not found`)
		if (relatedId !== undefined && !toCheck.elements?.length)
			throw new NotFoundException(`element with id ${relatedId} not found in directMessage with id ${dmId}`)
		const res = (await this.prisma.discussionMessage.create({
			data:
			{
				content: content,
				related: (relatedId !== undefined) ?
				{
					connect:
					{
						id: relatedId
					}
				}: undefined,
				discussionElement:
				{
					create:
					{
						author: username,
						directMessageId: dmId
					}
				}
			},
			select:
			{
				discussionElement: { select: this.discussionElementsSelect }
			}})).discussionElement
		const toNotify: string = (toCheck.requestingUserName !== username) ? toCheck.requestingUserName : toCheck.requestedUserName
		if (toNotify)
		{
			await this.appService.pushEvent(toNotify,
				{
					type: EventTypeList.DM_NEW_MESSAGE,
					data: { directMessageId: dmId, message: res } 
				})
		}
		return res
	}
	
	async deleteDmMessage(username: string, dmId: number, msgId: number)
	{
		const toCheck = await this.prisma.directMessage.findUnique({
			where:
			{
				id: dmId,
				OR:
				[
					{ requestedUserName: username },
					{ requestingUserName: username }
				]
			},
			select:
			{
				elements:
				{
					where:
					{
						id: msgId,
						message: { discussionElementId: msgId },
						author: username
					},
					select: { message: { select: { id: true } } },
					take: 1
				},
				requestingUserName: true,
				requestedUserName: true
			}})
		if (!toCheck)
			throw new NotFoundException(`directMessage with id ${dmId} not found`)
		if (!toCheck.elements.length)
			throw new NotFoundException(`message with id ${msgId} not found`)
		const trueMsgId: number = toCheck.elements[0].message.id
		const res = await this.prisma.discussionElement.update({ where: { id: msgId },
			data:
			{
				message: { delete: { id: trueMsgId } },
				event: { create: { eventType: EventType.MESSAGE_DELETED } },
			},
			select: this.discussionElementsSelect})
		const toNotify: string = (toCheck.requestedUserName !== username) ? toCheck.requestedUserName : toCheck.requestingUserName
		if (toNotify)
		{
			await this.appService.pushEvent(toNotify,
				{
					type: EventTypeList.DM_NEW_EVENT,
					data: { directMessageId: dmId, event: res }
				})
		}
	}

}
