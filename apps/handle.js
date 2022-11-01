import plugin from '../../../lib/plugins/plugin.js'
import lodash from 'lodash'
import common from '../../../lib/common/common.js'

export class anotice extends plugin {
    constructor() {
        super({
            name: '申请处理',
            event: 'message',
            priority: 500,
            rule: [
                {
                    reg: '^#?(同意|拒绝)申请.*$',
                    fnc: 'agree'
                },
                {
                    reg: '^#?(同意|拒绝)$',
                    fnc: 'agrees'
                },
                {
                    reg: '^#?回复.*$',
                    fnc: 'Replys'
                },
                {
                    reg: '^#(同意|拒绝)全部好友申请$',
                    fnc: 'agreesAll'
                },
                {
                    reg: '^#(加为|添加)好友$',
                    fnc: 'addFriend'
                }
            ]
        })
    }

    /** 同意好友申请 */
    async agree(e) {
        if (!e.isMaster) return
        let yes = /同意/.test(e.msg) ? true : false
        let qq = e.message[0].text.replace(/#|(同意|拒绝)申请/g, '').trim()
        if (e.message[1]) {
            qq = e.message[1].qq
        } else {
            qq = qq.match(/[1-9]\d*/g)
        }

        if (!qq) {
            e.reply('❎ 请输入正确的QQ号')
            return false
        }
        logger.mark(`[椰奶]${yes ? '同意' : '拒绝'}好友申请`)
        await Bot.pickFriend(qq)
            .setFriendReq('', yes)
            .then(() => e.reply(`✅ 已${yes ? '同意' : '拒绝'}${i}的好友申请`))
            .catch((err) => console.log(err))
    }

    /**同意拒绝全部好友申请 */
    async agreesAll(e) {
        if (!e.isMaster) return

        let yes = /同意/.test(e.msg) ? true : false

        let key = "yenai:friendapply"
        let res = await redis.get(key)
        if (!res) return e.reply("暂无好友申请")
        res = JSON.parse(res)

        if (lodash.isEmpty(res)) return e.reply("暂无好友申请")

        for (let i of res) {
            logger.mark(`[椰奶]${yes ? '同意' : '拒绝'}${i}的好友申请`)
            await Bot.pickFriend(i)
                .setFriendReq('', yes)
                .then(() => e.reply(`✅ 已${yes ? '同意' : '拒绝'}${i}的好友申请`))
                .catch((err) => console.log(err))
            await common.sleep(200)
        }
        await redis.del(key)
    }

    /** 引用同意好友申请和群邀请 */
    async agrees(e) {
        if (!e.isMaster) return
        if (!e.source) return
        if (!e.isPrivate) return
        let yes = /同意/.test(e.msg) ? true : false
        let source = (await e.friend.getChatHistory(e.source.time, 1)).pop()

        let res
        try {
            res = source.raw_message.split('\n')
        } catch {
            e.reply('❎ 消息可能已过期')
            return false
        }
        if (/申请人QQ/.test(res[1]) && /好友申请/.test(res[0])) {
            let qq = res[1].match(/[1-9]\d*/g)
            if (Bot.fl.get(Number(qq))) return e.reply('❎ 已经同意过该申请了哦~')

            logger.mark(`[椰奶]${yes ? '同意' : '拒绝'}好友申请`)

            await Bot.pickFriend(qq)
                .setFriendReq('', yes)
                .then(() => e.reply(`✅ 已${yes ? '同意' : '拒绝'}${qq}的好友申请`))
                .catch(() => e.reply('❎ 请检查是否已同意该申请'))
            //同意或拒绝删除数组中的
            let key = "yenai:friendapply"
            let apply = await redis.get(key)
            if (!apply) return
            apply = JSON.parse(apply)
            apply = lodash.without(apply, qq)
            if (lodash.isEmpty(apply)) {
                await redis.del(key)
            } else {
                await redis.set(key, JSON.stringify(apply))
            }
        } else if (
            /目标群号/.test(res[1]) &&
            /邀请人QQ/.test(res[3]) &&
            /邀请码/.test(res[6])
        ) {
            let groupid = res[1].match(/[1-9]\d*/g)
            if (Bot.fl.get(Number(groupid))) { return e.reply('❎ 已经同意过该申请了哦~') }

            let qq = res[3].match(/[1-9]\d*/g)
            let seq = res[6].match(/[1-9]\d*/g)

            logger.mark(`[椰奶]${yes ? '同意' : '拒绝'}群邀请`)

            Bot.pickUser(qq)
                .setGroupInvite(groupid, seq, yes)
                .then(() => e.reply(`✅ 已${yes ? '同意' : '拒绝'}${qq}的群邀请`))
                .catch(() => e.reply('❎ 请检查是否已同意该邀请'))
        } else {
            e.reply('❎ 请检查是否引用正确')
        }
    }

    // 回复好友消息
    async Replys(e) {
        if (!e.isMaster) return
        if (!e.isPrivate) return
        let qq;
        let msgs = e.message[0].text.split(' ')
        if (e.source) {
            let source = (await e.friend.getChatHistory(e.source.time, 1)).pop();
            let res;
            try {
                res = source.raw_message.split('\n')
            } catch {
                return e.reply('❎ 消息可能已过期')
            }
            if (/好友消息/.test(res[0]) && /好友QQ/.test(res[1])) {
                qq = res[1].match(/[1-9]\d*/g)
            } else if (/群临时消息/.test(res[0])) {
                return e.reply('❎ 群临时消息无法回复，请添加好友')
            } else {
                return e.reply('❎ 请检查是否引用正确')
            }
            e.message[0].text = e.message[0].text.replace(/#|回复/g, '').trim()
        } else {

            if (msgs.length == 1 && !/\d/.test(msgs[0])) {
                return e.reply('❎ QQ号不能为空')
            } else if (/\d/.test(msgs[0])) {
                qq = msgs[0].match(/[1-9]\d*/g)
                e.message[0].text = msgs.slice(1).join(' ')
            } else {
                qq = msgs[1]
                e.message[0].text = msgs.slice(2).join(' ')
            }
        }

        if (!/^\d+$/.test(qq)) return e.reply('❎ QQ号不正确，人家做不到的啦>_<~')

        if (!Bot.fl.get(Number(qq))) return e.reply('❎ 好友列表查无此人')

        if (!e.message[0].text) e.message.shift()

        if (e.message.length === 0) return e.reply('❎ 消息不能为空')

        logger.mark(`[椰奶]回复好友消息`)

        Bot.pickFriend(qq)
            .sendMsg(e.message)
            .then(() => { e.reply('✅ 已把消息发给它了哦~') })
            .catch((err) => e.reply(`❎ 发送失败\n错误信息为:${err.message}`))
    }
    
    //加群员为好友
    async addFriend(e) {
        if (!e.isMaster) return
        if (!e.source) return
        if (!e.isPrivate) return
        let source = (await e.friend.getChatHistory(e.source.time, 1)).pop()
        let msg = source.raw_message.split('\n')
        if (!/临时消息/.test(msg[0]) || !/来源群号/.test(msg[1]) || !/发送人QQ/.test(msg[2])) return
        let group = msg[1].match(/\d+/g)
        let qq = msg[2].match(/\d+/g)
        if (Bot.fl.get(Number(qq))) return e.reply('❎ 已经有这个人的好友了哦~')
        if (!Bot.fl.get(Number(group))) { return e.reply('❎ 群聊列表查无此群') }
        logger.mark(`[椰奶]主动添加好友`)
        Bot.addFriend(group, qq)
            .then(() => e.reply(`✅ 已向${qq}发送了好友请求`))
            .catch(() => e.reply("❎ 发送请求失败"))
    }

}