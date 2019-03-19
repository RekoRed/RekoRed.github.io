
CUSTOM_FLOW_DATA = {
    "Tail": {
        "active": true,
        "stiffness": 0.2,
        "radius": 0.08,
        "gravity": -0.01,
        "damping": 0.8,
        "inertia": 0.55,
        "delta": 0.35
    },
    "RightEar": {
        "active": true,
        "stiffness": 0.85,
        "radius": 0.02,
        "gravity": 0.001,
        "damping": 0.15,
        "inertia": 1,
        "delta": 0.3
    },
    "LeftEar": {
        "active": true,
        "stiffness": 0.85,
        "radius": 0.02,
        "gravity": 0.001,
        "damping": 0.15,
        "inertia": 1,
        "delta": 0.3
    }
};

CUSTOM_COLLISION_DATA = {
    "Spine2": {
        "type": "sphere",
        "radius": 0.12,
        "offset": {
            "x": 0,
            "y": 0.1,
            "z": 0
        }
    },
    "Head": {
        "type": "sphere",
        "radius": 0.07,
        "offset": {
            "x": 0,
            "y": 0.1,
            "z": 0
        }
    },
    "Hips": {
        "type": "sphere",
        "radius": 0.13,
        "offset": {
            "x": 0,
            "y": 0,
            "z": 0
        }
    },
    "Spine": {
        "type": "sphere",
        "radius": 0.15,
        "offset": {
            "x": 0,
            "y": 0.05,
            "z": 0
        }
    }
};
