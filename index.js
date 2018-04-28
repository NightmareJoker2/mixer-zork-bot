const Beam = require('beam-client-node');
const ws = require('ws');
const config = require('config');
const Zork = require('zorkmid/lib/zork-client').ZorkClient;
var ZorkClient = null;

let BeamClient = new Beam.Client(new Beam.DefaultRequestRunner());
var BeamChatSocket;
var beamChannel = config.get('Channels')[0]; // your channel token (username) or ID here

var userInfo;
var channelInfo;

const apiKey = config.get('Beam.key');

BeamClient.use(new Beam.OAuthProvider(BeamClient, {
    tokens: {
        access: apiKey,
        expires: Date.now() + (365 * 24 * 60 * 60 * 1000)
    },
}));
BeamClient.request('GET', 'users/current')
    .then(response =>
    {
        userInfo = response.body;
        BeamClient.request('GET', 'channels/' + beamChannel)
            .then(response =>
            {
                channelInfo = response.body;
                if (typeof(beamChannel) === 'string' && beamChannel != channelInfo.token)
                {
                    console.warn('Channel identified by token `' + beamChannel + '` has been renamed to `' + channelInfo.token + '`.');
                }
                return new Beam.ChatService(BeamClient).join(response.body.id);
            })
            .then(response =>
            {
                return createBeamChatSocket(userInfo.id, channelInfo.id, response.body.endpoints, response.body.hasOwnProperty('authkey') ? response.body.authkey : null);
            })
            .catch(error =>
            {
                if (error.statusCode == 404 && error.message == 'Channel not found.')
                {
                    console.error('Channel with token or ID `' + beamChannel + '` does not exist.');
                    return;
                }
                else
                {
                    console.error(error);
                }
            });
    })
    .catch(error =>
    {
        console.error(error);
    });

function createBeamChatSocket(userId, channelId, endpoints, authkey)
{
    const socket = new Beam.Socket(ws, endpoints).boot();

    socket.on('UserJoin', data =>
    {
        console.log('User with name `' + data.username + '` and ID `' + data.id + '` has joined.');
    });

    socket.on('UserLeave', data =>
    {
        console.log('User with name `' + data.username + '` and ID `' + data.id + '` has left.');

    });

    socket.on('ChatMessage', data =>
    {                                            
        var messageText = '';
        for (var i = 0; i < data.message.message.length; i++)
        {
            messageText += data.message.message[i].text;
        }
        console.log(data.user_name + ': ' + messageText);
        if (messageText == '!zork' || messageText.startsWith('!zork '))
        {
            zorkCommand(messageText.substring(6));
        }
    });

    socket.on('error', error =>
    {
        console.error(error);
    });

    socket.on('connected', data =>
    {
        console.log('Connected to chat');
        BeamChatSocket = socket;
    });

    socket.on('authresult', data =>
    {
        if (data.authenticated)
        {
            console.log('Authenticated to chat as user with roles/permissions');
        }
        else
        {
            console.log('Anonymously connected to chat.');
            console.warn('Listening to messages only');
        }
    });

    console.log('Authenticating chat...');
    return socket.auth(channelId, userId, authkey).then(() =>
    {
        console.log('Authenticated to chat.');
    });
}

var BANNED_WORDS = new Set(['quit']);

function zorkCommand(commandText)
{
    var words = commandText.replace(/[^\x00-\x7F]/g, '').split(/\b/);
    if (words.some(function(word) { return BANNED_WORDS.has(word); }))
    {
        return;
    }
    var cmd = words.join(' ').replace(/\s\s+/g, ' ');

    if (ZorkClient === null)
    {
        ZorkClient = new Zork((data) =>
        {
            const copyrightText = 'ZORK I: The Great Underground Empire Copyright (c) 1981, 1982, 1983 Infocom, Inc. All rights reserved. ZORK is a registered trademark of Infocom, Inc. Revision 88 / Serial number 840726';
            if (data.length > 0)
            {
                data = data.trim().replace(/>$/, '').trim().replace(/\s\s+/g, ' ').replace(/^(.{360}[^\s]*).*/, "$1").trim();
                if (data.startsWith(copyrightText))
                {
                    data = data.substring(copyrightText.length).trim();
                }
                console.log('Received: ', data);
                if (data != 'spawn zork1')
                {
                    if (data.startsWith(ZorkClient.lastCommand))
                    {
                        data = data.substring(ZorkClient.lastCommand.length).trim();
                    }
                    if (data.length > 0)
                    {
                        BeamChatSocket.call('msg', [data])
                        .catch(error =>
                            {
                                console.error(error);
                            });
                    }
                }
            }
        });
        /*
        BeamChatSocket.call('msg', ['ZORK init'])
        .catch(error =>
            {
                console.error(error);
            });
        */
        console.log('Starting up Zork client...');
    }

    console.log('Sending: ', cmd);
    ZorkClient.lastCommand = cmd.trim();
    ZorkClient.send(cmd);

}