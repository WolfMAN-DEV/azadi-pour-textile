const {promisify} = require('util');
const jsonWebToken = require('jsonwebtoken');

const User = require('../models/User');
const Ticket = require('../models/Ticket');
const TicketAnswer = require('../models/TicketAnswer');
const catchRequest = require('../utils/catchRequest');
const AppError = require('../utils/AppError');

exports.protect = catchRequest(async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
        token = req.cookies.jwt;
    }
    if (!token) {
        throw new AppError('0x0000C', 401);
    }
    const decodedToken = await promisify(jsonWebToken.verify)(token, process.env.JSON_WEB_TOKEN_SECRET);
    const user = await User.findById(decodedToken.id);
    if (!user) {
        throw new AppError(
            '0x0000D',
            401
        );
    }
    if (user.isPasswordChanged(decodedToken.iat)) {
        throw new AppError(
            '0x0000E',
            401
        );
    }
    req.user = user;
    next();
});

exports.restrictTo = (...rotes) => {
    return catchRequest(
        async (req, res, next) => {
            if (rotes.includes(req.user.rote))
                return next();
            if (rotes.includes('selfUser'))
                if (req.user._id === req.params.id)
                    return next();
            if (rotes.includes('selfUserTickets')) {
                req.query.user = req.user._id.toString();
                return next();
            }
            if (rotes.includes('selfUserTicket')) {
                const ticket = await Ticket.findById(req.query.id);
                if (req.user._id.toString() === ticket.user.toString()) {
                    return next();
                }
            }
            if (rotes.includes('selfTicketTicketAnswers'))
                if (req.body.ticket) {
                    const ticket = await Ticket.findById(req.body.ticket);
                    if (ticket.user === req.user._id)
                        return next();
                }
            if (rotes.includes('selfTicketAnswer'))
                if (req.body.ticket) {
                    const ticket = await Ticket.findById(req.body.ticket);
                    if (ticket.user === req.user._id)
                        return next();
                }
            if (rotes.includes('selfTicketTicketAnswer')) {
                const ticketAnswer = await TicketAnswer.findById(req.params.id);
                const ticket = await Ticket.findById(ticketAnswer.ticket);
                if (ticket.user === req.user._id)
                    return next();
            }
            throw new AppError('0x0000F', 403);
        }
    );
};

const signToken = ({_id}) => {
    return jsonWebToken.sign(
        {
            id: _id
        },
        process.env.JSON_WEB_TOKEN_SECRET,
        {
            expiresIn: process.env.JSON_WEB_TOKEN_TIME
        }
    );
};

const sendToken = (user, statusCode, res) => {
    const token = signToken(user);
    const cookieOptions = {
        expires: new Date(
            Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
        ),
        httpOnly: true
    };
    if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

    res.cookie('jwt', token, cookieOptions);

    user.password = undefined;

    res.cookie('jwt', token, {
        httpOnly: true
    });

    res.status(statusCode).json({
        status: 'success',
        token,
        data: {
            user
        }
    });
};

exports.signOut = (req, res) => {
    res.clearCookie('jwt');
    res.status(200).json({status: 'success'})
};

exports.signIn = catchRequest(async (req, res) => {
    const {email, password} = req.body;
    if (
        !email ||
        !password ||
        !/^(([^<>()\[\].,;:\s@"]+(\.[^<>()\[\].,;:\s@"]+)*)|(".+"))@(([^<>()[\].,;:\s@"]+\.)+[^<>()[\].,;:\s@"]{2,})$/i.test(email) ||
        !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,100}$/.test(password)) {
        throw new AppError('0x00010', 400);
    }
    const user = await User.findOne({email}).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
        throw new AppError('0x00011', 401);
    }

    sendToken(user, 200, res);
});

exports.isSignedIn = catchRequest(
    async (req, res) => {
        res.status(200).json({
            status: 'success',
            data: {
                user: req.user
            }
        });
    }
);

exports.signUp = catchRequest(
    async (req, res) => {
        const user = await User.create({
            email: req.body.email,
            password: req.body.password
        });

        sendToken(user, 201, res);
    }
);

exports.setUser = catchRequest(
    (req, res, next) => {
        req.body.user = req.user._id.toString();
        next();
    }
);