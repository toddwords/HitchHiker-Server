var express = require("express");
var app = express();
var server = app.listen(process.env.PORT || 3000);
app.use(express.static("public"));
console.log("server running");
var socket = require("socket.io");
var io = socket(server, {
  pingTimeout: 180000,
  transports: ['websocket'],
  allowUpgrades: false
});
console.log(io)
io.sockets.on("connection", newConnection);

function newConnection(socket) {
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
    //if(socket.role == "guide"){onGuideDisconnect()}
    if (socket.nickname)
      newMsg({
        username: "server",
        msg: socket.nickname + " has left " + socket.room,
        color: [127, 127, 127]
      });
    sendStatus({ msg: "disconnect" });
    socket.leave(socket.room);
    socket.room = "lobby";
    socket.role = false;
    socket.join("lobby");
  });

  socket.on("newMsg", newMsg);
  socket.on("newPage", newPage);
  socket.on("changeText", changeText);
  socket.on("joinRoom", function(data) {
    data.username = sanitize(data.username);
    data.room = sanitize(data.room);
    socket.nickname = data.username;
    var roomInList = data.room in io.sockets.adapter.rooms;
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
    else if (
      (roomInList &&
        data.role == "guide" &&
        !io.sockets.adapter.rooms[data.room].guide.includes(socket.nickname)) ||
      (data.room == "lobby" && data.role == "guide")
    ) {
      socket.emit("toClient", {
        error: "There is already a guide in this room"
      });
      console.log("should send error to client");
    } else {
      // if(socket.room){socket.leave(socket.room)};
      socket.join(data.room);
      socket.leave("lobby");
      console.log(io.sockets.adapter.rooms[data.room]);
      if (!roomInList) {
        io.sockets.adapter.rooms[data.room].guide = [socket.nickname];
        socket.broadcast
          .to("lobby")
          .emit("toClient", { rooms: io.sockets.adapter.rooms });
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
  socket.on("getCurrentPage", function(data) {
    console.log(io.sockets.adapter.rooms[socket.room].url);
    socket.emit("newPage", { url: io.sockets.adapter.rooms[socket.room].url });
  });
  socket.on("addGuide", addGuide);
  socket.on("swapGuide", function(data) {
    addGuide(data);
    getRoom().guide.filter(e => e !== socket.nickname);
    socket.role = "audience";
    serverMsg(socket.nickname + " is no longer a guide");
    socket.emit("becomeAudience");
  });
  socket.on("status", sendStatus);
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
      if (socket.room !== "lobby")
        io.sockets.adapter.rooms[socket.room].url = url;
      socket.broadcast.to(socket.room).emit("newPage", { url: url });
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
    io.sockets.adapter.rooms[socket.room].guide.push(data.username);
    newGuideSocket.emit("becomeGuide");
    serverMsg(data.username + " is now a guide");
  }
  function getRoom() {
    return io.sockets.adapter.rooms[socket.room];
  }
  function findSocketByUsername(username) {
    if (!io.sockets.adapter.rooms[socket.room]) {
      return false;
    }
    for (var clientId in io.sockets.adapter.rooms[socket.room].sockets) {
      //this is the socket of each client in the room.
      var clientSocket = io.sockets.connected[clientId];

      if (clientSocket.nickname == username) {
        return clientSocket;
      }
    }
  }
  function onGuideDisconnect() {
    serverMsg("Guide has left the room. Closing room...");
    setTimeout(function() {
      io.of("/")
        .in(socket.room)
        .clients.forEach(function(s) {
          s.leave(socket.room);
          s.emit("toClient", { disconnected: true });
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
  var usersInRoom = [];
  if (!io.sockets.adapter.rooms[currentSocket.room]) {
    return false;
  }
  for (var clientId in io.sockets.adapter.rooms[currentSocket.room].sockets) {
    //this is the socket of each client in the room.
    var clientSocket = io.sockets.connected[clientId];

    if (clientSocket.nickname) {
      usersInRoom.push(clientSocket.nickname);
    }
  }
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
