import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionList, Prisma, RoleApplyingType } from '@prisma/client';
import { hash } from 'bcrypt';
import { PrismaService } from 'nestjs-prisma';
import { CreateChanTest } from './dto/createChan.dto';
import { AppService } from 'src/app.service';
import { EventType } from '@prisma/client';
import { CreateChanMessageDTO } from './dto/createChanMessage.dto';
import { NotFoundError } from 'rxjs';
import { PermissionsService } from './permissions/permissions.service';
import { SseService } from 'src/sse/sse.service';

enum EventTypeList
{
	CHAN_DELETED = "CHAN_DELETED",
	CHAN_NEW_EVENT = "CHAN_NEW_EVENT",
	CHAN_NEW_MESSAGE = "CHAN_NEW_MESSAGE",
	DM_NEW_EVENT = "DM_NEW_EVENT",
}

@Injectable()
export class ChansService
{

	constructor(private readonly prisma: PrismaService,
				private readonly permissionsService: PermissionsService,
			    private readonly appService: AppService,
			    private readonly sseService: SseService) {}


	private usersSelect = Prisma.validator<Prisma.UserSelect>()
	({
		name: true,
	})

	private rolesSelect = Prisma.validator<Prisma.RoleSelect>()
	({
		permissions: true,
		roleApplyOn: true,
		roles: { select: { name: true } },
		name: true,
		users: { select: this.usersSelect },
	})

	private chansSelect = Prisma.validator<Prisma.ChanSelect>()
	({
		id: true,
		title: true,
		type: true,
		ownerName: true,
		users: { select: this.usersSelect },
		roles: { select: this.rolesSelect },
	})

	private discussionEventsSelect = Prisma.validator<Prisma.DiscussionEventSelect>()
	({
		eventType: true,
		concernedUser: true,
	})

	private discussionMessagesSelect = Prisma.validator<Prisma.DiscussionMessageSelect>()
	({
		content: true,
		relatedId: true,
		relatedUsers: { select: { name: true } },
		relatedRoles: { select: { name: true } },
	})

	private discussionElementsSelect = Prisma.validator<Prisma.DiscussionElementSelect>()
	({
		id: true,
		event: { select: this.discussionEventsSelect },
		message: { select: this.discussionMessagesSelect },
		author: true,
		creationDate: true
	})

	private defaultPermissions: PermissionList[] =
	[
		'INVITE',
		'SEND_MESSAGE',
	]

	private adminPermissions: PermissionList[] =
	[
		'KICK',
		'BAN',
		'MUTE'
	]


	async getUserChans(username: string) // /me
	{
		// TODO: test later if find user then select chan is faster
		return this.prisma.chan.findMany({
			where:
			{
				users: { some: { name: username } }
			},
			select: this.chansSelect})
	}

	async createChan(username: string, chan: CreateChanTest)
	{
		if (chan.password)
			chan.password = await hash(chan.password, 10)
		try
		{
			const res = await this.prisma.chan.create({
				data:
				{
					type: chan.type,
					title: chan.title,
					password: chan.password,
					owner: { connect: { name: username } },
					users: { connect: { name: username } },
					roles:
					{
						create:
						[
							
							{
								name: 'DEFAULT',
								permissions: this.defaultPermissions,
								roleApplyOn: RoleApplyingType.NONE
							},
							{
								name: 'ADMIN',
								permissions: this.adminPermissions,
								roleApplyOn: RoleApplyingType.ROLES,
							},
						]
					},
				},
				select: this.chansSelect})
			await this.prisma.role.update({ where: { chanId_name: { chanId: res.id, name: 'ADMIN'} },
				data:
				{
					roles: { connect: { chanId_name: { chanId: res.id, name: 'DEFAULT' } } }
				}})
			return res
		}
		catch
		{
			throw new ConflictException(`conflict, a chan with the  title ${chan.title} already exist`)
		}
	}

	async deleteChan(username: string, id: number)
	{
		const toCheck = await this.prisma.chan.findUnique({
			where:
			{
				id: id,
				users: { some: { name: username } }
			},
			select:
			{
				roles:
				{
					where: this.permissionsService.getRolesDoesUserHasRighTo(username, username, PermissionList.DESTROY),
					take: 1,
					select: { id: true }
				},
				ownerName: true
			}})
		if (!toCheck)
			throw new NotFoundException("chan not found")
		if (!toCheck.roles.length && toCheck.ownerName !== username)
			throw new ForbiddenException("you don't have right to destroy this chan")
		const toNotify = (await this.prisma.chan.delete({
			where: { id: id },
			select:
			{
				users: { select: this.usersSelect }
			}})).users
		toNotify.forEach(el => this.sseService.pushEvent(el.name, { type: EventTypeList.CHAN_DELETED, data: { chanId: id } }))
	}

	async leaveChan(username: string, id: number)
	{
		const toCheck = await this.prisma.chan.findUnique({
			where:
			{
				id: id,
				users: { some: { name: username } }
			},
			select: { ownerName: true }})
		if (!toCheck)
			throw new NotFoundException(`chan with id ${id} not found`)
		if (toCheck.ownerName === username) // the owner need to transfer the ownership before leaving or deleting the chan
			throw new ForbiddenException(`owner can't leave a chan`)
		const toNotify = (await this.prisma.chan.update({ where: { id: id },
			data:
			{
				users: { disconnect: { name: username } },
			},
			select:
			{
				users:
				{
					where: { name: { not: username } },
					select: { name: true }
				}
			}
		})).users
	const res = (await this.prisma.discussionEvent.create({
		data:
		{
			eventType: EventType.AUTHOR_LEAVED,
			discussionElement:
			{
				create:
				{
					chanId: id,
					author: username
				}
			}
		},
		select: { discussionElement: { select: this.discussionElementsSelect }}})).discussionElement
		toNotify.forEach(el => this.sseService.pushEvent(el.name, { type: EventTypeList.CHAN_NEW_EVENT, data: { chanId: id, event: res } }))
	}

	async createChanMessage(username: string, chanId: number, content: string, relatedId?: number, usersAt?: string[])
	{
		return (await this.prisma.discussionMessage.create({
			data:
			{
				content: content,
				relatedUsers: usersAt &&
				{
					connect: usersAt.map(el => { return { name: el } })
				},
				related: relatedId &&
				{
					connect: { id: relatedId }
				},
				discussionElement:
				{
					create:
					{
						chanId: chanId,
						author: username,
					}
				}
			},
			select:
			{
				discussionElement: { select: this.discussionElementsSelect }
			}})).discussionElement
	}

	async removeMutedIfUntilDateReached(state: any)
	{
		if (!state.untilDate || new Date() < state.untilDate)
			return false
		await this.prisma.mutedUserChan.delete({ where: { id: state.id } , select: { id: true } })
		return true
	}

	async createChanMessageIfRightTo(username: string, chanId: number, dto: CreateChanMessageDTO)
	{
		const { relatedId, content, usersAt } = dto
		const toCheck = await this.prisma.chan.findUnique({
			where:
			{
				id: chanId,
				users: { some: { name: username } },
			},
			select:
			{
				ownerName: true,
				elements: relatedId &&
				{
					where: { id: relatedId },
					select: { id: true },
				},
				users: usersAt &&
				{
					where: { name: { in: usersAt } },
					take: usersAt.length,
					select: { name: true },
				},
				roles:
				{
					where: this.permissionsService.getRolesDoesUserHasRighTo(username, username, PermissionList.SEND_MESSAGE),
					take: 1,
					select: { id: true },
				},
				mutedUsers:
				{
					where: { mutedUserName: username },
					take: 1,
					select: { mutedUserName: true, untilDate: true, id: true },
				}
			}})
		if (!toCheck)
			throw new NotFoundError(`chan with id ${chanId} not found`)
		if (relatedId && !toCheck.elements.length)
			throw new ForbiddenException(`msg with id ${relatedId} not found`)
		if (usersAt && toCheck.users.length != usersAt.length)
			throw new ForbiddenException(`some users at not found`)
		if (!toCheck.roles.length && toCheck.ownerName !== username)
			throw new ForbiddenException(`you don't have right to send msg`)
		if (toCheck.mutedUsers.length) // TODO: need to perform a check because unMute will probably be handled with a set timeOut but need to check if serv has been restarded before all setTimeOut completed
		{
			if (!(await this.removeMutedIfUntilDateReached(toCheck.mutedUsers[0])))
				throw new ForbiddenException(`you are muted`)
		}
		const res = await this.createChanMessage(username, chanId, content, relatedId, usersAt)
		const toNotify = (await this.prisma.chan.findUnique({ where: { id: chanId },
			select:
			{
				users:
				{
					where: { name: { not: username } },
					select: { name: true },
				}
			}})).users
		await this.notifyChanMessage(toNotify, chanId, res)
		return res
	}

	async getChanMessages(username: string, chanId: number, nMessages: number, start?: number)
	{
		const res = await this.prisma.chan.findUnique({
			where:
			{
				id: chanId,
				users: { some: { name: username } }
			},
			select:
			{
				elements:
				{
					cursor: (start !== undefined) ? { id: start } : undefined,
					orderBy: { id: 'desc' },
					take: nMessages,
					skip: (start !== undefined) ? 1 : undefined,
					select: this.discussionElementsSelect,
				}
			}})
		if (!res)
			throw new NotFoundException(`chan with id ${chanId} not found`)
		return res.elements.reverse()
	}

	async deleteChanMessage(username: string, chanId: number, msgId: number)
	{
		const toCheck = await this.prisma.chan.findUnique({
			where:
			{
				id: chanId,
				users: { some: { name: username } }
			},
			select:
			{
				elements:
				{
					where:
					{
						id: msgId,
						message: { discussionElementId: msgId }
					},
					select:
					{
						message: { select: { id: true } },
						author: true
					},
					take: 1
				},
				users:
				{
					where: { name: { not: username } },
					select: { name: true }
				}
			}})
		if (!toCheck)
			throw new NotFoundException(`chan with id ${chanId} not found`)
		if (!toCheck.elements.length)
			throw new NotFoundException(`msg with id ${msgId} not found in chan with id ${chanId}`)
		const author = toCheck.elements[0].author
		if (!(await this.permissionsService.doesUserHasRightTo(username, author, PermissionList.DELETE_MESSAGE, chanId)))
			throw new ForbiddenException(`you don't have the right to do delete this msg`)
		const res = await this.prisma.discussionElement.update({ where: { id: msgId },
			data:
			{
				message: { delete: {} },
				event: { create: { eventType: EventType.MESSAGE_DELETED } },
			},
			select: this.discussionElementsSelect})
		await this.notifyChanEvent(toCheck.users, chanId, res)
	}

	async kickUserFromChan(username: string, toKick: string, chanId: number)
	{
		const toCheck = await this.prisma.chan.findUnique({
			where:
			{
				id: chanId,
				users: { some: { name: username } }
			},
			select:
			{
				users: { where: { name: toKick }, select: { name: true }, take: 1 },
				roles:
				{
					where: this.permissionsService.getRolesDoesUserHasRighTo(username, toKick, PermissionList.KICK),
					select: { id: true },
					take: 1
				},
				ownerName: true
			}})
		if (!toCheck)
			throw new NotFoundException(`chan with id ${chanId} not found`)
		if (!toCheck.users.length)
			throw new NotFoundException(`user ${toKick} doesn't exist in chan with id ${chanId}`)
		if (!toCheck.roles.length || toCheck.ownerName === toKick)
			throw new ForbiddenException(`you don't have right to kick ${toKick}`)
		const toNotify = (await this.prisma.chan.update({ where: { id: chanId },
			data:
			{
				users: { disconnect: { name: toKick } }
			},
			select:
			{
				users:
				{
					where: { name: { not: username } },
					select: { name: true },
				}
			}})).users
		toNotify.push({ name: toKick })
		await this.notifyChanEvent(toNotify, chanId, await this.createChanEvent(username, chanId, EventType.AUTHOR_KICKED_CONCERNED, toKick))
	}

	async createChanEvent(author: string, chanId: number, eventType: EventType, concerned?: string)
	{
		return (await this.prisma.discussionEvent.create({
			data:
			{
				eventType: eventType,
				concernedUserRelation: concerned && { connect: { name: concerned } },
				discussionElement:
				{
					create:
					{
						authorRelation: { connect: { name: author } },
						chan: { connect: { id: chanId } }
					}
				}
			},
			select:
			{
				discussionElement: { select: this.discussionElementsSelect }
			}})).discussionElement
	}

	async notifyChanEvent(users: { name: string }[], chanId: number, event: Prisma.PromiseReturnType<typeof this.createChanEvent>)
	{
		return this.sseService.pushEventMultipleUser(users.map(el => el.name),
			{
				type: EventTypeList.CHAN_NEW_EVENT,
				data: { chanId: chanId, event: event }
			})
	}
	
	async notifyChanMessage(users: { name: string }[], chanId: number, message: Prisma.PromiseReturnType<typeof this.createChanMessage>)
	{
		return this.sseService.pushEventMultipleUser(users.map(el => el.name),
			{
				type: EventTypeList.CHAN_NEW_MESSAGE,
				data: { chanId: chanId, message: message }
			})
	}

	private async addUserToChan(username: string, chanId: number)
	{
		const toNotify = (await this.prisma.chan.update({ where: { id: chanId },
			data: { users: { connect: { name: username } }, },
			select: { users: { select: { name: true } } }})).users.map(el => el.name)
		const res = await this.prisma.discussionElement.create({
			data:
			{
				chan: { connect: { id: chanId } },
				authorRelation: { connect: { name: username } },
				event:
				{
					create:
					{
						eventType: EventType.AUTHOR_JOINED
					}
				}
			},
			select: this.appService.discussionElementsSelect})
		
		await this.sseService.pushEventMultipleUser(toNotify,
			{
				type: EventTypeList.CHAN_NEW_EVENT,
				data: { chanId: chanId, event: res }
			})
		return res
	}

	async acceptChanInvitation(username: string, chanInvitationId: number) // need to split this dirty func
	{
		/* Check que l'invitation existe et récupère le chanel pour lequel elle est */
		const toCheck = await this.prisma.chanInvitation.findUnique({
			where:
			{
				id: chanInvitationId,
				requestedUserName: username
			},
			select: { chanId: true }})
		if (!toCheck)
			throw new ForbiddenException(`chanInvitation with id ${chanInvitationId} not found`)
		/* Check que l'invitation existe et récupère le chanel pour lequel elle est */

		/* Récupère les invitations vers le même chan pour le même user */
		let invitations = (await this.prisma.user.findUnique({ where: { name: username },
			select:
			{
				incomingChanInvitation:
				{
					where: { chanId: toCheck.chanId },
					select:
					{
						id: true,
						requestingUserName: true,
						discussionEvent: { select: { id: true } },
						friendShip: { select: { directMessage: { select: { id: true } } } }
					}
				}
			}})).incomingChanInvitation
		/* Récupère les invitations vers le même chan pour le même user */

		const joinEvent = await this.addUserToChan(username, toCheck.chanId)

		// delete toute les invitations
		await this.prisma.chanInvitation.deleteMany({ where: { id: { in: invitations.map(el => el.id) } } })

		// update event in direct message
		await this.prisma.discussionEvent.updateMany({
			where: { id: { in: invitations.map(el => el.discussionEvent.id) } },
			data:
			{
				eventType: EventType.ACCEPTED_CHAN_INVITATION,
			}})

		// select all event and send it via sse
		const res = (await this.prisma.discussionEvent.findMany({
			where: { id: { in: invitations.map(el => el.discussionEvent.id) } },
			select:
			{
				discussionElement: { select: { directMessageId: true, ...this.appService.discussionElementsSelect } }
			}})).map(el => el.discussionElement)
		const a = res.reduce((acc, curr) =>
			{
				const { directMessageId, ...rest } = curr
				acc.set(directMessageId, rest)
				return acc
			}, new Map<number, any>())
		await Promise.all(invitations.map(async inv =>
			{
				return this.sseService.pushEventMultipleUser([inv.requestingUserName, username],
					{
						type: EventTypeList.DM_NEW_EVENT,
						data:
						{
							directMessageId: inv.friendShip.directMessage.id,
							event: a.get(inv.friendShip.directMessage.id)
						}
					})
			}))
		return { chan: { id: toCheck.chanId, event: joinEvent }, dms: a }
	}

}
