// One-time script to fix customer names for orders 1131 and 1151
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyDUK-H7scDD-9t_yVASmG34ypw7AlKwNTY",
    authDomain: "poshakh-stock.firebaseapp.com",
    projectId: "poshakh-stock",
    storageBucket: "poshakh-stock.firebasestorage.app",
    messagingSenderId: "97524547700",
    appId: "1:97524547700:web:08f8d39ed9be7ec75a9121"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function fixCustomerNames() {
    try {
        // Sign in anonymously first
        console.log('Signing in...');
        await signInAnonymously(auth);
        console.log('✅ Signed in successfully\n');
        
        console.log('Starting customer name fix...\n');

        // Fix order 1131 - Change to "Sanjana Banerjee"
        console.log('Looking for order #1131...');
        let q1131 = query(collection(db, 'production_orders'), where('orderNumber', '==', '1131'));
        let snapshot1131 = await getDocs(q1131);
        
        // Try as number if string search fails
        if (snapshot1131.empty) {
            console.log('Trying numeric search...');
            q1131 = query(collection(db, 'production_orders'), where('orderNumber', '==', 1131));
            snapshot1131 = await getDocs(q1131);
        }
        
        if (!snapshot1131.empty) {
            const order1131 = snapshot1131.docs[0];
            console.log('Found order #1131, current customer:', order1131.data().customerName);
            await updateDoc(doc(db, 'production_orders', order1131.id), {
                customerName: 'Sanjana Banerjee'
            });
            console.log('✅ Order #1131 updated to "Sanjana Banerjee"');
        } else {
            console.log('⚠️  Order #1131 not found');
        }

        // Fix order 1151 - Change to "Sanjana"
        console.log('\nLooking for order #1151...');
        let q1151 = query(collection(db, 'production_orders'), where('orderNumber', '==', '1151'));
        let snapshot1151 = await getDocs(q1151);
        
        // Try as number if string search fails
        if (snapshot1151.empty) {
            console.log('Trying numeric search...');
            q1151 = query(collection(db, 'production_orders'), where('orderNumber', '==', 1151));
            snapshot1151 = await getDocs(q1151);
        }
        
        if (!snapshot1151.empty) {
            const order1151 = snapshot1151.docs[0];
            console.log('Found order #1151, current customer:', order1151.data().customerName);
            await updateDoc(doc(db, 'production_orders', order1151.id), {
                customerName: 'Sanjana'
            });
            console.log('✅ Order #1151 updated to "Sanjana"');
        } else {
            console.log('⚠️  Order #1151 not found');
        }

        console.log('\n✅ Customer name fix completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error fixing customer names:', error);
        process.exit(1);
    }
}

fixCustomerNames();
