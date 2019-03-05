const express = require('express');
const router = express.Router();
http = require("http");
app = express();
server = http.createServer();
io = require("socket.io").listen(server);

let rooms = [];


router.get('/', function(req, res, next) {
  res.send("Chat server is running on port 3000");
});

io.on("connection", (socket) => {
  console.log("user connected");
  console.log(rooms);

  // User creates new room
  socket.on("createroom", (username) => {
    //generate random room key
    let room = "";
    let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let i = 0; i < 4; i++)
      room += possible.charAt(Math.floor(Math.random() * possible.length));

    rooms.push(room);
    console.log("Created room: " + room);

    socket.username = username;
    socket.join(room);
    console.log("Joined room: " + room);

    io.sockets.in(room).emit("createdroom", room);
  });

  // User joins existing room
  socket.on("joinroom", (data) => {
    const room = data.roomKey.toUpperCase();
    const username = data.username;
    if(rooms.includes(room)) {
      socket.username = username;
      socket.join(room);
      io.sockets.in(room).emit("userjoined", username);
      console.log(username + " joined room " + room);
    } else {
      console.log(username + " tried to join unexisting room: " + room);
      socket.emit("err", "ERROR, No Room named " + room);
    }
  });
});

server.listen(3000, () => {
  console.log("Node app is running on port 3000");
});

module.exports = router;
