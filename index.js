require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const jose = require('jose-cjs');
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGODB_URI;
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json())

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const verifyJWT = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const secret = new TextEncoder().encode(process.env.BETTER_AUTH_SECRET);
        const { payload } = await jose.jwtVerify(token, secret);
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

const run = async () => {
    try {
        const database = client.db(process.env.DB_NAME);
        const usersCollection = database.collection(process.env.DB_USERS);
        const campaignsCollection = database.collection(process.env.DB_CAMPAIGNS);
        const contributionsCollection = database.collection(process.env.DB_CONTRIBUTIONS);
        const withdrawalsCollection = database.collection(process.env.DB_WITHDRAWALS);
        const paymentsCollection = database.collection(process.env.DB_PAYMENTS);
        const notificationsCollection = database.collection(process.env.DB_NOTIFICATIONS);
        const reportsCollection = database.collection(process.env.DB_REPORTS);

        // Initialize credits after registration
        app.post('/api/user/initialize-credits', verifyJWT, async (req, res) => {
            try {
                const { email, role } = req.user;

                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(404).json({ error: 'User not found' });

                if (user.credits && user.credits > 0) {
                    return res.status(400).json({ error: 'Credits already initialized' });
                }

                const credits = role === 'creator' ? 20 : 50;
                await usersCollection.updateOne({ email }, { $set: { credits } });

                const updated = await usersCollection.findOne({ email });
                res.json({ credits: updated.credits, role: updated.role });
            } catch (err) {
                res.status(500).json({ error: 'Failed to initialize credits' });
            }
        });

        // Get current user profile
        app.get('/api/user/profile', verifyJWT, async (req, res) => {
            try {
                const user = await usersCollection.findOne(
                    { email: req.user.email },
                    { projection: { name: 1, email: 1, photo: 1, role: 1, credits: 1 } }
                );
                if (!user) return res.status(404).json({ error: 'User not found' });
                res.json(user);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch profile' });
            }
        });

        // Get top 6 funded campaigns
        app.get('/api/campaigns/top', async (req, res) => {
            try {
                const campaigns = await campaignsCollection
                    .find({ status: 'approved' })
                    .sort({ raisedAmount: -1 })
                    .limit(6)
                    .toArray();
                res.json(campaigns);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch campaigns' });
            }
        });

        // Platform statistics
        app.get('/api/stats', async (req, res) => {
            try {
                const totalCampaigns = await campaignsCollection.countDocuments();
                const totalCreators = await usersCollection.countDocuments({ role: 'creator' });
                const totalSupporters = await usersCollection.countDocuments({ role: 'supporter' });
                const creditsResult = await campaignsCollection.aggregate([
                    { $group: { _id: null, total: { $sum: '$raisedAmount' } } }
                ]).toArray();
                const totalCredits = creditsResult[0]?.total || 0;
                res.json({ totalCampaigns, totalCreators, totalSupporters, totalCredits });
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch stats' });
            }
        });

        console.log("MongoDB connected 🚀");
    } finally {
        // await client.close();
    }
};

run().catch(console.dir);

app.listen(port, () => {
    console.log("Server running on port", port);
});