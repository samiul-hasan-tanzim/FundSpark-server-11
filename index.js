require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const jose = require('jose-cjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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

        const database = client.db(process.env.DB_NAME);
        const usersCollection = database.collection(process.env.DB_USERS);

        const user = await usersCollection.findOne(
            { email: token },
            { projection: { name: 1, email: 1, photo: 1, role: 1, credits: 1 } }
        );
        if (!user) return res.status(401).json({ error: 'User not found' });

        req.user = user;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

const verifyCreator = async (req, res, next) => {
    if (req.user?.role !== 'creator') {
        return res.status(403).json({ error: 'Creator access required' });
    }
    next();
};

const verifySupporter = async (req, res, next) => {
    if (req.user?.role !== 'supporter') {
        return res.status(403).json({ error: 'Supporter access required' });
    }
    next();
};

const verifyAdmin = async (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
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

        // Create a new campaign
        app.post('/api/campaigns/create', verifyJWT, verifyCreator, async (req, res) => {
            try {
                const { title, story, category, fundingGoal, minimumContribution, deadline, rewardInfo, image } = req.body;

                if (!title || !story || !category || !fundingGoal || !minimumContribution || !deadline) {
                    return res.status(400).json({ message: 'Missing required fields' });
                }

                const campaign = {
                    title,
                    story,
                    category,
                    fundingGoal: Number(fundingGoal),
                    minimumContribution: Number(minimumContribution),
                    deadline: new Date(deadline),
                    rewardInfo: rewardInfo || '',
                    image: image || '',
                    creatorEmail: req.user.email,
                    creatorName: req.user.name || '',
                    raisedAmount: 0,
                    status: 'pending',
                    createdAt: new Date(),
                };

                const result = await campaignsCollection.insertOne(campaign);
                res.status(201).json({ _id: result.insertedId, ...campaign });
            } catch (err) {
                res.status(500).json({ message: 'Failed to create campaign' });
            }
        });

        // Creator dashboard stats
        app.get('/api/creator/stats', verifyJWT, verifyCreator, async (req, res) => {
            try {
                const email = req.user.email;
                const totalCampaigns = await campaignsCollection.countDocuments({ creatorEmail: email });
                const activeCampaigns = await campaignsCollection.countDocuments({ creatorEmail: email, status: 'approved' });
                const raisedResult = await campaignsCollection.aggregate([
                    { $match: { creatorEmail: email } },
                    { $group: { _id: null, total: { $sum: '$raisedAmount' } } }
                ]).toArray();
                const totalRaised = raisedResult[0]?.total || 0;
                res.json({ totalCampaigns, activeCampaigns, totalRaised });
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch creator stats' });
            }
        });

        // Pending contributions for creator
        app.get('/api/contributions/pending', verifyJWT, verifyCreator, async (req, res) => {
            try {
                const email = req.user.email;
                const contributions = await contributionsCollection
                    .find({ creatorEmail: email, status: 'pending' })
                    .sort({ createdAt: -1 })
                    .toArray();
                res.json(contributions);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch pending contributions' });
            }
        });

        // List all approved campaigns
        app.get('/api/campaigns', async (req, res) => {
            try {
                const campaigns = await campaignsCollection
                    .find({ status: 'approved', deadline: { $gt: new Date() } })
                    .sort({ createdAt: -1 })
                    .toArray();
                res.json(campaigns);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch campaigns' });
            }
        });

        // Get single campaign by ID
        app.get('/api/campaigns/:id', async (req, res) => {
            try {
                const campaign = await campaignsCollection.findOne({ _id: new ObjectId(req.params.id) });
                if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
                res.json(campaign);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch campaign' });
            }
        });

        // Submit a contribution
        app.post('/api/campaigns/contribute', verifyJWT, verifySupporter, async (req, res) => {
            try {
                const { campaignId, contributionAmount } = req.body;

                if (!campaignId || !contributionAmount) {
                    return res.status(400).json({ message: 'Missing required fields' });
                }

                const campaign = await campaignsCollection.findOne({ _id: new ObjectId(campaignId) });
                if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

                const amount = Number(contributionAmount);
                if (amount < campaign.minimumContribution) {
                    return res.status(400).json({ message: `Minimum contribution is ${campaign.minimumContribution} credits` });
                }

                const user = await usersCollection.findOne({ email: req.user.email });
                if (!user || user.credits < amount) {
                    return res.status(400).json({ message: 'Insufficient credits' });
                }

                const contribution = {
                    campaignId,
                    campaignTitle: campaign.title,
                    contributionAmount: amount,
                    supporterEmail: req.user.email,
                    supporterName: req.user.name || '',
                    creatorEmail: campaign.creatorEmail,
                    creatorName: campaign.creatorName || '',
                    status: 'pending',
                    createdAt: new Date(),
                };

                const result = await contributionsCollection.insertOne(contribution);

                await usersCollection.updateOne(
                    { email: req.user.email },
                    { $inc: { credits: -amount } }
                );

                await notificationsCollection.insertOne({
                    message: `${req.user.name || 'Someone'} contributed ${amount} credits to "${campaign.title}"`,
                    toEmail: campaign.creatorEmail,
                    actionRoute: `/dashboard/creator`,
                    createdAt: new Date(),
                });

                res.status(201).json({ _id: result.insertedId, ...contribution });
            } catch (err) {
                res.status(500).json({ message: 'Failed to submit contribution' });
            }
        });

        // Admin: get all users
        app.get('/api/admin/users', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const users = await usersCollection.find({})
                    .project({ name: 1, email: 1, photo: 1, role: 1, credits: 1 })
                    .toArray();
                res.json(users);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch users' });
            }
        });

        // Admin: update user role
        app.put('/api/admin/users/role', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { email, role } = req.body;
                if (!email || !role) return res.status(400).json({ message: 'Email and role required' });
                if (!['supporter', 'creator', 'admin'].includes(role)) {
                    return res.status(400).json({ message: 'Invalid role' });
                }
                if (email === 'admin@admin.com') {
                    return res.status(403).json({ message: 'Cannot change role of super admin' });
                }
                const result = await usersCollection.updateOne({ email }, { $set: { role } });
                if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
                res.json({ message: 'Role updated' });
            } catch (err) {
                res.status(500).json({ message: 'Failed to update role' });
            }
        });

        // Admin: remove user
        app.delete('/api/admin/users/remove', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { email } = req.body;
                if (!email) return res.status(400).json({ message: 'Email required' });
                if (email === 'admin@admin.com') {
                    return res.status(403).json({ message: 'Cannot remove super admin' });
                }
                const result = await usersCollection.deleteOne({ email });
                if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });
                res.json({ message: 'User removed' });
            } catch (err) {
                res.status(500).json({ message: 'Failed to remove user' });
            }
        });

        // Admin: platform stats
        app.get('/api/admin/stats', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const totalSupporters = await usersCollection.countDocuments({ role: 'supporter' });
                const totalCreators = await usersCollection.countDocuments({ role: 'creator' });
                const creditsResult = await usersCollection.aggregate([
                    { $group: { _id: null, total: { $sum: '$credits' } } }
                ]).toArray();
                const totalCredits = creditsResult[0]?.total || 0;
                const totalPayments = await paymentsCollection.countDocuments();
                res.json({ totalSupporters, totalCreators, totalCredits, totalPayments });
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch admin stats' });
            }
        });

        // Admin: get pending campaigns
        app.get('/api/admin/campaigns/pending', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const campaigns = await campaignsCollection
                    .find({ status: 'pending' })
                    .sort({ createdAt: -1 })
                    .toArray();
                res.json(campaigns);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch pending campaigns' });
            }
        });

        // Admin: approve campaign
        app.put('/api/admin/campaigns/approve', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { campaignId } = req.body;
                if (!campaignId) return res.status(400).json({ message: 'Campaign ID required' });

                const campaign = await campaignsCollection.findOne({ _id: new ObjectId(campaignId) });
                if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

                await campaignsCollection.updateOne(
                    { _id: new ObjectId(campaignId) },
                    { $set: { status: 'approved' } }
                );

                await notificationsCollection.insertOne({
                    message: `Your campaign "${campaign.title}" has been approved and is now live!`,
                    toEmail: campaign.creatorEmail,
                    actionRoute: `/dashboard/creator`,
                    createdAt: new Date(),
                });

                res.json({ message: 'Campaign approved' });
            } catch (err) {
                res.status(500).json({ message: 'Failed to approve campaign' });
            }
        });

        // Admin: get all campaigns
        app.get('/api/admin/campaigns/all', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const campaigns = await campaignsCollection
                    .find({})
                    .sort({ createdAt: -1 })
                    .toArray();
                res.json(campaigns);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch campaigns' });
            }
        });

        // Admin: delete campaign
        app.delete('/api/admin/campaigns/delete', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { campaignId } = req.body;
                if (!campaignId) return res.status(400).json({ message: 'Campaign ID required' });

                const campaign = await campaignsCollection.findOne({ _id: new ObjectId(campaignId) });
                if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

                const approvedContributions = await contributionsCollection
                    .find({ campaignId, status: 'approved' })
                    .toArray();

                for (const c of approvedContributions) {
                    await usersCollection.updateOne(
                        { email: c.supporterEmail },
                        { $inc: { credits: c.contributionAmount } }
                    );
                }

                await contributionsCollection.deleteMany({ campaignId });
                await campaignsCollection.deleteOne({ _id: new ObjectId(campaignId) });

                res.json({ message: 'Campaign deleted' });
            } catch (err) {
                res.status(500).json({ message: 'Failed to delete campaign' });
            }
        });

        // Admin: reject campaign
        app.put('/api/admin/campaigns/reject', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { campaignId } = req.body;
                if (!campaignId) return res.status(400).json({ message: 'Campaign ID required' });

                const campaign = await campaignsCollection.findOne({ _id: new ObjectId(campaignId) });
                if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

                await campaignsCollection.updateOne(
                    { _id: new ObjectId(campaignId) },
                    { $set: { status: 'rejected' } }
                );

                await notificationsCollection.insertOne({
                    message: `Your campaign "${campaign.title}" has been rejected.`,
                    toEmail: campaign.creatorEmail,
                    actionRoute: `/dashboard/creator`,
                    createdAt: new Date(),
                });

                res.json({ message: 'Campaign rejected' });
            } catch (err) {
                res.status(500).json({ message: 'Failed to reject campaign' });
            }
        });

        // Report a campaign
        app.post('/api/reports/create', verifyJWT, async (req, res) => {
            try {
                const { campaignId, reason } = req.body;

                if (!campaignId || !reason) {
                    return res.status(400).json({ message: 'Missing required fields' });
                }

                const campaign = await campaignsCollection.findOne({ _id: new ObjectId(campaignId) });
                if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

                const report = {
                    reporterName: req.user.name || '',
                    reporterEmail: req.user.email,
                    campaignId,
                    campaignTitle: campaign.title,
                    reason,
                    createdAt: new Date(),
                };

                const result = await reportsCollection.insertOne(report);
                res.status(201).json({ _id: result.insertedId, ...report });
            } catch (err) {
                res.status(500).json({ message: 'Failed to submit report' });
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