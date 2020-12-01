var express = require("express");
var app = express();
var server = app.listen(process.env.PORT || 3000);
app.use(express.static("public"));
console.log("server running");
var socket = require("socket.io");
const RTCMultiConnectionServer = require('rtcmulticonnection-server');
var io = socket(server);

io.sockets.on("connection", newConnection);

let sessions = {};
let heartbeat = setInterval(function(){
  for(const room in sessions) {
    // console.log("room: "+room)
    if(!io.sockets.adapter.rooms.has(room)){
      delete sessions[room]
    }
    else{
      for(const g in sessions[room].guide){
        // console.log("guide: "+g)
        io.to(sessions[room].guide[g]).emit("heartbeat", sessions[room].audience)
      }
    }

  }
}, 1000)
function newConnection(socket) {
  RTCMultiConnectionServer.addSocket(socket);
  console.log("new connection: " + socket.id);
  socket.join("lobby");
  socket.room = "lobby";
  socket.on("disconnect", function() {
    //if(socket.role == "guide"){onGuideDisconnect()}
    // else{
    if (socket.room !== "lobby") {
      newMsg({
        username: "server",
        msg: socket.nickname + " has left " + socket.room,
        color: [127, 127, 127]
      });
      sendStatus({ msg: "disconnect" });
    }
    //}
  });
  socket.on("leaveRoom", function(data) {
    if(socket.role == "guide"){onGuideDisconnect()}
    else if (socket.nickname){
      newMsg({
        username: "server",
        msg: socket.nickname + " has left " + socket.room,
        color: [127, 127, 127]
      });
      sendStatus({ msg: "disconnect" });
      delete sessions[socket.room].audience[socket.nickname];
      socket.leave(socket.room);
      socket.room = "lobby";
      socket.role = false;
      socket.join("lobby");
    }
  });

  socket.on("newMsg", newMsg);
  socket.on("newPage", newPage);
  socket.on("changeText", changeText);
  socket.on("joinRoom", function(data) {
    data.username = sanitize(data.username);
    data.room = sanitize(data.room);
    socket.nickname = data.username;
    var roomInList = io.sockets.adapter.rooms.has(data.room);
    console.log("role: " + data.role);
    console.log("nickname: " + socket.nickname);
    if(!data.room){
        socket.emit("toClient", {
        error:
          "please enter a room name"
      });
    }
   else if (!roomInList && data.role == "audience") {
      socket.emit("toClient", {
        error:
          "no room by that name in list. please try again"
      });
    }
    //prevent unauthorized multiple guides
    else if ((roomInList && data.role == "guide" && !(sessions[data.room].guide.hasOwnProperty(socket.nickname))) ||
      (data.room == "lobby" && data.role == "guide")
    ) {
      socket.emit("toClient", {
        error: "There is already a guide in this room"
      });
      console.log("should send error to client");
    } 
    //create/join room
    else {
      // if(socket.room){socket.leave(socket.room)};
      socket.join(data.room);
      socket.leave("lobby");
      // console.log(io.sockets.adapter);
      // console.log(io.sockets.adapter.rooms);
      if (!roomInList) {
        
        sessions[data.room] = {guide:{}, audience: {}};
        sessions[data.room].guide[socket.nickname] = socket.id;
        socket.to("lobby").emit("toClient", { rooms: io.sockets.adapter.rooms });
        console.log(sessions)
      }
      else {
        sessions[data.room].audience[socket.nickname] = {socket: socket.id, status: "has joined room "+data.room}
        console.log(sessions)
      }
      socket.room = data.room;
      socket.role = data.role;
      console.log(data.username + " has joined " + data.room);
      console.log(io.sockets.adapter.rooms);
      socket.emit("toClient", { joinRoomSuccess: true, room: data.room });
      newMsg({
        username: "server",
        msg: data.username + " has joined " + data.room,
        color: [127, 127, 127]
      });
      sendStatus({ msg: "joined" });
      sendUsersInRoom(socket);
    }
  });
  socket.on("getRooms", function(data) {
    socket.emit("toClient", { rooms: io.sockets.adapter.rooms });
  });
  socket.on("getUsers", function(data) {
    sendUsersInRoom(socket);
  });
  socket.on("guideEvent", function(data) {
    if (socket.room !== "lobby") io.in(socket.room).emit("guideEvent", data);
  });
  socket.on("inviteLobby", function(){
    console.log("invite message received")
    socket.to("lobby").emit("newMsg", {username: "server", msg: socket.nickname + " invites you to join the room: "+socket.room, color: [127, 127, 127] })
  })
  socket.on("getCurrentPage", function(data) {
    if(sessions[socket.room] && sessions[socket.room].url){
      socket.emit("newPage", { url: sessions[socket.room].url });
    }
  });
  socket.on("addGuide", addGuide);
  socket.on("swapGuide", function(data) {
    addGuide(data);
    getRoom().guide.filter(e => e !== socket.nickname);
    socket.role = "audience";
    serverMsg(socket.nickname + " is no longer a guide");
    socket.emit("becomeAudience");
  });
  socket.on("status", updateStatus);
  function updateStatus(data){
    let status = sanitize(data.msg);
    if(sessions[socket.room] && sessions[socket.room].audience[socket.nickname]){
      sessions[socket.room].audience[socket.nickname].status = status;
    }
  }
  function sendStatus(data) {
    console.log("status received");
    data.username = socket.nickname;
    data.type = "status";
    data.msg = sanitize(data.msg);
    console.log(data);
    // console.log(io.sockets.adapter.rooms[socket.room].guide)
    io.in(socket.room).emit("status", data);
  }
  function newMsg(data) {
    data.msg = sanitize(data.msg);
    io.in(socket.room).emit("newMsg", data);
  }
  function serverMsg(msg) {
    newMsg({ username: "server", msg: msg, color: [127, 127, 127] });
  }
  function newPage(data) {
    var url = data.url;
    if (isURL(url)) {
      if (url.indexOf("http") < 0) {
        url = "http://" + url;
      }
      if (socket.room !== "lobby"){
        sessions[socket.room].url = url;
        socket.to(socket.room).emit("newPage", { url: url });
      }
      
    }
    //the line below will send to everyone including the client
    // io.sockets.emit('mouse', data);
    console.log(data);
    console.log(socket.room);
  }
  function changeText(data) {
    data.text = sanitize(data.text);
    socket.broadcast.to(socket.room).emit("changeText", data);
  }
  function addGuide(data) {
    let newGuideSocket = findSocketByUsername(data.username);
    newGuideSocket.role = "guide";
    console.log(sessions)
    sessions[socket.room].guide[data.username] = newGuideSocket;
    io.to(newGuideSocket).emit("becomeGuide");
    serverMsg(data.username + " is now a guide");
  }
  function getRoom() {
    return sessions[socket.room];
  }
  function findSocketByUsername(username) {
    return sessions[socket.room].audience[username].socket
  }
  function onGuideDisconnect() {
    serverMsg("Guide has left the room. Closing room...");
    setTimeout(function() {
      io.sockets.in(socket.room).sockets.forEach(function(s) {
          s.leave(socket.room);
          s.room = "lobby";
          s.role = false;
          s.join("lobby");
          s.emit("reset")
        });
    }, 3000);
  }
}

function isURL(str) {
  var regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-\/]))?/;
  if (!regex.test(str)) {
    return false;
  } else {
    return true;
  }
}

function sendUsersInRoom(currentSocket) {
  console.log(currentSocket.room)
  // console.log(sessions)
  var usersInRoom = sessions[currentSocket.room].audience;
  currentSocket.emit("toClient", { users: usersInRoom });
}

function sanitize(string) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  };
  const reg = /[&<>]/gi;
  if (string) return string.replace(reg, match => map[match]);
  else return string;
}
