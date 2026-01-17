// Script to search for orders with "Sanajana" in customer name
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyDUK-H7scDD-9t_yVASmG34ypw7AlKwNTY",
    authDomain: "poshakh-stock.firebaseapp.com",
    projectId: "poshakh-stock",
    storageBucket: "poshakh-stock.firebasestorage.app",
    messagingSenderId: "97524547700",
    appId: "1:97524547700:web:08f8d39ed9be7ec75a9121"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function findOrders() {
    try {
        console.log('Signing in...');
        await signInAnonymously(auth);
        console.log('✅ Signed in\n');
        
        console.log('Searching for orders...\n');
        
        const snapshot = await getDocs(collection(db, 'production_orders'));
        
        // Find orders with Sanajana or similar
        const matchingOrders = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const customerName = (data.customerName || '').toLowerCase();
            if (customerName.includes('sana') || data.orderNumber === '1131' || data.orderNumber === '1151' || data.orderNumber === 1131 || data.orderNumber === 1151) {
                matchingOrders.push({
                    id: doc.id,
                    orderNumber: data.orderNumber,
                    customerName: data.customerName,
                    orderType: typeof data.orderNumber
                });
            }
        });
        
        console.log(`Found ${matchingOrders.length} matching orders:\n`);
        matchingOrders
            .sort((a, b) => {
                const numA = parseInt(a.orderNumber) || 0;
                const numB = parseInt(b.orderNumber) || 0;
                return numA - numB;
            })
            .forEach(order => {
                console.log(`Order #${order.orderNumber} (${order.orderType}): ${order.customerName}`);
            });
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

findOrders();
