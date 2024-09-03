db = db.getSiblingDB("seminario");
db.createUser({
	user: "miusurio",
	pwd: "mipassword",
	roles: [{role: "readWrite", db: "seminario"}]
});
